---
title: "Idempotency in Distributed Systems: The Production Realities"
headline: "Idempotency, without the Redis lock"
slug: "idempotency-in-distributed-systems"
description: "Why a Redis lock doesn't make retries safe, and how to do it in one Postgres transaction, including what happens when a duplicate arrives mid-request."
publishDate: "2026-09-09T23:50:00Z"
updatedDate: "2026-10-18T10:00:00Z"
updateSummary: "Rewritten. Corrected how concurrent duplicates behave: with the claim and the business writes in one transaction, a duplicate never sees IN_PROGRESS; Postgres makes it wait, then it replays the stored response. The handler now caps that wait with lock_timeout, and its behaviour is shown from a test run. The external-API section now covers what happens when the process dies mid-call. Also fixed the Redis command, which was SETNX with an EX argument that SETNX doesn't take."
author: "Prayash Mishra"
pillar: "messaging"
cover: "idempotency"
tags: ["postgresql", "microservices"]
series: "reliable-messaging"
seriesPart: 3
startHere: 2
related: ["scaling-event-dispatching-nestjs-strategy-pattern"]
draft: false
---

A user taps "Confirm payment" as their phone drops off the network. Three seconds later the request times out, and the app retries.

The server has no way of knowing from the retry alone what happened to the first attempt. Maybe it never arrived. Maybe it arrived, charged the card, committed, and the connection died while the `200` was on its way back. If you treat the retry as a new request, the second case charges the customer twice.

Retries aren't the edge case here; they're how you get reliability out of a network that drops things. Mobile clients retry, load balancers retry, message brokers redeliver anything that wasn't acknowledged. So the question isn't how to prevent duplicates. It's how to make processing the same request twice have the same effect as processing it once.

This post is about doing that for HTTP APIs and message consumers that keep their state in PostgreSQL. It's the third part of a series. [Part 2](/blog/transactional-outbox-pattern-production-realities) covers getting events into the broker without losing them, and explains why that guarantees duplicates on this side.

## Why a Redis lock isn't enough

The quick version you'll find in a lot of places: put an `Idempotency-Key` header on the request, and in middleware run

```bash
SET idem:123 1 NX EX 60
```

If Redis sets the key, process the request. If the key already exists, return `409`.

It takes a few lines and passes every test with a single process in it. It goes wrong in three ways once real failures happen:

```text
Client                 API worker                  Redis             Postgres
  |                        |                         |                   |
  |-- POST /pay (key 123) ->|                         |                   |
  |                        |-- SET idem:123 NX ----->| OK                |
  |                        |                                             |
  |                        x  worker killed (OOM, node drained) before   |
  |                           anything reaches Postgres or the card      |
  |  ...timeout...                                                       |
  |-- retry (key 123) ---->|                                             |
  |                        |-- SET idem:123 NX ----->| (key exists)      |
  |<------- 409 -----------|                                             |
```

1. **The crash window.** The key is set before the work is done. If the worker dies in between, the key stays, every retry is turned away, and the payment never happens. The client sees a "duplicate" for a request that was never processed.
2. **The key can disappear.** Under memory pressure Redis evicts keys if an eviction policy allows it, and after a failover, writes that hadn't reached the replica are gone. Either way, a retry gets through as a first attempt.
3. **The TTL can expire mid-request.** If a slow database turns a 2-second request into a 65-second one, a 60-second key expires while the first attempt is still running, and a retry runs concurrently with it.

All three come from the same thing: the record that says "this was done" lives in a different system from the thing that was done, so they can disagree. If your data is in Postgres, put the idempotency record in Postgres, and write it in the same transaction as the work.

## Pattern 1: make the operation idempotent by itself

Before adding a table, check whether the operation can be made safe to repeat as written.

This one can't. Run it twice and the account loses 200:

```sql
UPDATE accounts SET balance = balance - 100 WHERE id = 42;
```

These can. The first is a state transition that only applies once. The second is an upsert keyed on what makes the row unique:

```sql
UPDATE orders
SET status = 'CANCELLED', cancelled_at = now()
WHERE id = 42 AND status IN ('PENDING', 'AWAITING_PAYMENT');
```

```sql
INSERT INTO user_subscriptions (user_id, plan_id, billing_cycle_start)
VALUES (101, 'pro_annual', '2026-09-01')
ON CONFLICT (user_id, billing_cycle_start)
DO UPDATE SET plan_id = EXCLUDED.plan_id;
```

Run the cancellation five times and the first affects one row, the rest affect none, and the order ends up in the same state. When an operation can be written like this, it doesn't need anything else.

## Pattern 2: an idempotency record in the same transaction

When a request touches several tables, writes an audit log, or moves money, record the request itself:

```sql
CREATE TABLE idempotency_records (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    request_path    VARCHAR(255) NOT NULL,
    request_hash    CHAR(64)     NOT NULL,   -- SHA-256 of the request body
    status          VARCHAR(32)  NOT NULL,   -- IN_PROGRESS, COMPLETED
    response_code   INT,
    response_body   JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_idempotency_records_created_at ON idempotency_records (created_at);
```

### What a duplicate actually runs into

The claim row and the business writes go in one transaction. That has a consequence that's easy to get wrong: nobody outside that transaction ever sees the row as `IN_PROGRESS`. Until request A commits, its claim is invisible.

So a duplicate doesn't find a row that says "in progress". It runs into the primary key. When request B runs `INSERT … ON CONFLICT DO NOTHING` for a key that A has inserted but not committed, Postgres can't tell yet whether A's row will end up existing, so B waits for A to finish. Then it gets the conflict, and B returns whatever A stored.

```text
Request A (key "abc")                       Request B (same key, 300 ms later)
─────────────────────                       ──────────────────────────────────
BEGIN                                       BEGIN
INSERT claim … ON CONFLICT DO NOTHING
  → 1 row (visible only to A)
run the transfer                            INSERT claim … ON CONFLICT DO NOTHING
                                              → waits on A's uncommitted row
UPDATE claim SET status = 'COMPLETED',
  response_code = 201, response_body = …
COMMIT ───────────────────────────────────►   → 0 rows (conflict)
201 Created                                 SELECT stored response; COMMIT
                                            request_hash differs → 422
                                            request_hash matches → replay the 201
```

Two other endings matter. If A rolls back, B's insert succeeds and B does the transfer itself, which is what you want after a failure. If A takes longer than B is willing to wait, B gives up with a lock timeout, and that's the only point where a `409` makes sense.

### Production Implementation

```typescript
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { pool, executeTransfer } from "./db";

export async function handleTransfer(req: Request, res: Response) {
  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Missing Idempotency-Key header" });
  }

  const requestHash = createHash("sha256").update(JSON.stringify(req.body)).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A duplicate that arrives while the first attempt is still running will
    // wait on the INSERT below. Cap that wait instead of parking a pooled
    // connection behind someone else's transaction.
    await client.query("SET LOCAL lock_timeout = '5s'");

    const claim = await client.query(
      `INSERT INTO idempotency_records (idempotency_key, request_path, request_hash, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS')
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [idempotencyKey, req.originalUrl, requestHash]
    );

    if (claim.rowCount === 0) {
      // We only get here after the other transaction committed, so the row
      // is COMPLETED. An IN_PROGRESS row is never visible from outside the
      // transaction that wrote it.
      const { rows: [record] } = await client.query(
        `SELECT request_hash, response_code, response_body
         FROM idempotency_records WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      await client.query("COMMIT");

      if (record.request_hash !== requestHash) {
        return res.status(422).json({ error: "Idempotency key reused with a different payload." });
      }
      return res.status(record.response_code).json(record.response_body);
    }

    const result = await executeTransfer(client, req.body);

    await client.query(
      `UPDATE idempotency_records
       SET status = 'COMPLETED', response_code = 201, response_body = $1, updated_at = NOW()
       WHERE idempotency_key = $2`,
      [JSON.stringify(result), idempotencyKey]
    );
    await client.query("COMMIT");
    return res.status(201).json(result);
  } catch (err: any) {
    // Rolling back also removes our claim row, so a retry starts clean.
    await client.query("ROLLBACK");

    if (err.code === "55P03") { // lock_not_available: first attempt still running
      res.setHeader("Retry-After", "2");
      return res.status(409).json({ error: "A request with this key is still being processed." });
    }
    throw err;
  } finally {
    client.release();
  }
}
```

This exact handler was run against Postgres 16 with `pg` 8.13, using an `executeTransfer` that sleeps to simulate slow work:

| Scenario | Result |
| :--- | :--- |
| Duplicate arrives 300 ms into a 3 s transfer | Waited, then `201` with the same `transferId`. One transfer row. |
| Same key, different amount | `422` |
| Duplicate arrives 300 ms into a 7 s transfer (`lock_timeout` is 5 s) | `409` with `Retry-After: 2` after ~5 s. First request still finished with `201`. |
| First attempt throws; duplicate already waiting | First one errors, duplicate wins the claim and gets `201` |

One detail from that run: the replayed body came back as `{"amount":100,"transferId":1}` while the original was `{"transferId":1,"amount":100}`. JSONB doesn't keep key order. That's fine for JSON clients, but if anything compares responses byte for byte (signature checks, snapshot tests), store `response_body` as `TEXT`.

The cost of this design is that a duplicate holds a pooled connection while it waits. A burst of retries against one slow request can take several connections at once, which is why the `lock_timeout` is there.

---


## Pattern 3: when the work includes an external call

Pattern 2 relies on the whole request fitting in one database transaction. A call to Stripe, Twilio or another company's API can't be part of that transaction, and you shouldn't hold a transaction open across one anyway. If the process dies after Stripe has charged the card but before your commit, the database says nothing happened, and a retry will charge again.

Two things fix it.

**Derive the provider's idempotency key from yours.** Most payment APIs accept one. Never generate a fresh UUID per attempt. Build it from the client's key, so every retry of the same request sends the same key:

```typescript
const paymentIntent = await stripe.paymentIntents.create(
  { amount: 5000, currency: "usd", customer: customerId },
  { idempotencyKey: `pay_${incomingIdempotencyKey}` },
);
```

Stripe answers a repeated key with the result of the first call instead of creating a second payment. The older Charges API takes the same option.

**Split the work into steps, with a committed claim in front.** This is the one place a visible `IN_PROGRESS` row is real:

1. In one transaction, claim the key and save a pending payment. Commit.
2. Call the provider with the derived key.
3. In a second transaction, record the outcome, and mark the claim `COMPLETED` with the response to replay.

A duplicate that arrives during step 2 now sees the committed `IN_PROGRESS` row and gets a `409` with `Retry-After`. The case left to handle is a process that dies during step 2 and leaves the claim in progress forever. Give the claim a lease, so a stale claim can be taken over:

```sql
INSERT INTO idempotency_records (idempotency_key, request_path, request_hash, status, updated_at)
VALUES ($1, $2, $3, 'IN_PROGRESS', now())
ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = now()
  WHERE idempotency_records.status = 'IN_PROGRESS'
    AND idempotency_records.updated_at < now() - interval '5 minutes'
RETURNING idempotency_key;
```

A row back means you own the request, either because it's new or because the previous owner went quiet for five minutes. Whoever takes over repeats step 2 with the same derived key, so Stripe returns the payment that already exists instead of making another. The same statement shape is tested in the [outbox post](/blog/transactional-outbox-pattern-production-realities#5-the-outbox-only-covers-the-publishing-side), against a table of processed events.

The derived key is only as good as the provider's memory of it. Stripe keeps idempotency keys for at least 24 hours and may remove them after that, at which point a repeated key is treated as a new request. That's far longer than any sensible retry window, but it's a limit with a date on it, and it differs from provider to provider. Check it before you rely on it.

## Mistakes worth checking for

**The client reuses a key for a different request.** A frontend generates the key when the page loads instead of when the form is submitted, so a user who buys item A, goes back and buys item B sends both under one key. If you only look the key up, they get charged for B and receive A's receipt. Hash the body and compare: same key, different hash is a `422`. Note that `JSON.stringify` of a parsed body depends on key order, so a client that sends the same fields in a different order gets a false `422`. Hash a canonical form if your clients can do that.

**Caching a `500`.** If the idempotency layer stores a server error as the final answer, every retry gets the same error back, forever. Only store successes and deterministic client errors (`4xx`). In Pattern 2 the rollback takes care of this, because the claim disappears with everything else. In Pattern 3 the claim is already committed, so on a failure you have to delete it or let the lease expire.

**Retries arriving faster than you finish.** Mobile clients on bad connections retry aggressively. If a request takes 300 ms and the client gives up after 250, the retry lands while the first attempt is still running. The primary key and `ON CONFLICT` handle that safely: the runner-up waits for the winner instead of running alongside it. What they don't handle is the cost of waiting, which is why the handler sets a `lock_timeout`.

**The table grows forever.** Delete or partition away records older than your retry window. After 30 days, a "retry" is a new request.

[TODO: if any of these happened on your project, one sentence on which one and how it showed up.]

## Summary

- Keep idempotency state in the same database as the data it protects, and write it in the same transaction when you can.
- Expect duplicates to arrive while the first attempt is still running, and decide how long they may wait.
- Store a hash of the request with the key, and reject a reused key with a different body.
- For external calls, derive the provider's idempotency key from yours, commit the claim first, and give it a lease.

## Further reading

- PostgreSQL docs: [`INSERT … ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- PostgreSQL docs: [`lock_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT)
- Stripe API reference: [idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- Redis docs: [`SET`, including `NX` and `EX`](https://redis.io/docs/latest/commands/set/)
- Earlier in the series: [Message Queues, Topics, and Event Streams](/blog/message-queues-topics-event-streams-explained) and [The Transactional Outbox Pattern](/blog/transactional-outbox-pattern-production-realities)
