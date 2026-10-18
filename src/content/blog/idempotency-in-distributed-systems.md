---
title: "Idempotency in Distributed Systems: The Production Realities"
slug: "idempotency-in-distributed-systems"
description: "Why distributed retries make duplicate operations inevitable, why Redis locks fall short, and how to build truly idempotent APIs using ACID state engines and two-phase writes."
publishDate: "2026-09-09T23:50:00Z"
updatedDate: "2026-10-18T10:00:00Z"
updateSummary: "Corrected how concurrent duplicates behave. With the claim and the business writes in one transaction, a duplicate never sees IN_PROGRESS. Postgres makes it wait on the key, then it replays the stored response. The handler now caps that wait with lock_timeout and only returns 409 when it expires. I also replaced the diagram, which the site wasn't rendering, and added the test results."
author: "Prayash Mishra"
pillar: "messaging"
tags: ["postgresql", "microservices"]
series: "reliable-messaging"
seriesPart: 3
startHere: 2
related: ["scaling-event-dispatching-nestjs-strategy-pattern"]
draft: false
---

A user taps "Confirm Payment". Their phone drops off 5G while walking into a subway station. Three seconds later, the HTTP request times out.

What does the mobile client do? It retries.

What actually happened on your backend? Did the first request die before reaching your API gateway? Or did your database commit the transaction, charge the card, and drop the connection right as it was writing the HTTP 200 response back to the client?

The client has no idea. Your server doesn't either—unless you engineered an explicit contract for it.

In distributed systems, networks drop packets. Gateways time out. Worker nodes crash mid-transaction. Because of this, **at-least-once delivery is the only guarantee physical networks can ever give you.** Exactly-once delivery is a marketing myth. If clients retry—and they must—your APIs have to make duplicate executions safe.

That is idempotency. Not textbook math formulas, but the practical engineering required so a retried network request doesn't bill a user twice or corrupt your ledger.

> **Where this sits in the bigger picture.** This post is about the *consumer* half
> of reliable messaging. The two halves fail independently and both have to be
> solved:
>
> - **Getting the message into the broker** without a gap between "committed to
>   the database" and "published to Kafka" →
>   [The Transactional Outbox Pattern](/blog/transactional-outbox-pattern-production-realities)
> - **Handling the message more than once** on the other side → this post.
>
> The transport guarantees underneath both are in
> [Message Queues, Topics, and Event Streams](/blog/message-queues-topics-event-streams-explained).
>
> If you take one thing from this post: the outbox guarantees **at-least-once**,
> and at-least-once is only safe if the consumer is idempotent. Neither half
> works alone.

---

## The Naive Redis Trap: `SETNX` Is Not Idempotency

Almost every online tutorial recommends the exact same quick fix:
> *"Stick an `Idempotency-Key` header on the request. In your middleware, run `SETNX idempotency_key 1 EX 60` in Redis. If it returns 1, process the request. If it returns 0, throw a 409 Conflict."*

It takes twenty lines of code. It passes unit tests. And in production, it will silently corrupt your business data.

Here is why:

```
Client               API Gateway / App Worker               Redis                 Database
  |                             |                             |                      |
  |--- POST /pay (Key: 123) --->|                             |                      |
  |                             |--- SETNX key_123 (OK) ----->|                      |
  |                             |                                                    |
  |                             |=========== WORKER OOM / NODE REBOOT ===============|
  |                             | (Process dies before writing to DB or charging card)
  |                             x
  | (Timeout: 5s)
  |
  |--- RETRY POST (Key: 123) -->|
                                |--- SETNX key_123 (EXISTS) ->|
                                |<-- Return False ------------|
                                |
                                |---> Returns 409 Conflict (or "Already Processed")
```

Look closely at what happens when things go wrong:

1. **The Crash Window:** Between the moment Redis returns `OK` for your lock and the moment your code finishes writing to PostgreSQL, your app can die. A Kubernetes node reschedule, an out-of-memory kill, or a sudden segfault. The key stays locked in Redis. The client retries, gets rejected with `409 Conflict` or a bogus "already processed" response, and the customer's payment is permanently lost.
2. **Eviction and Failover:** Redis is an in-memory cache. Under memory pressure, keys get evicted under LRU policies. During a Sentinel or Cluster failover, asynchronous replication lag can drop keys that were acknowledged milliseconds earlier.
3. **Execution Exceeds TTL:** If your database experiences a sudden lock spike, the request might take 65 seconds. If your Redis TTL was 60 seconds, Redis quietly expires the key. The client's retry arrives, acquires the lock again, and runs a second concurrent mutation against your database.

The lesson is simple: **If your business state lives in a relational database, your idempotency state must live in the same database, committed inside the exact same ACID transaction.**

---

## Pattern 1: Natural Idempotency (The Best Code is No Code)

Before adding tables, check whether your domain logic can be made idempotent by design. Many operations don't need dedicated tokens at all.

* **Non-idempotent:**
  ```sql
  UPDATE accounts SET balance = balance - 100 WHERE id = 42;
  ```
  Run this twice, lose $200.

* **Naturally idempotent state machine:**
  ```sql
  UPDATE orders 
  SET status = 'CANCELLED', cancelled_at = NOW() 
  WHERE id = 42 AND status IN ('PENDING', 'AWAITING_PAYMENT');
  ```
  Run this once: `rows_affected = 1`. Run it five more times: `rows_affected = 0`. The final state of the database is identical every single time.

* **Naturally idempotent upsert:**
  ```sql
  INSERT INTO user_subscriptions (user_id, plan_id, billing_cycle_start)
  VALUES (101, 'pro_annual', '2026-09-01')
  ON CONFLICT (user_id, billing_cycle_start) 
  DO UPDATE SET plan_id = EXCLUDED.plan_id;
  ```

If your operation is already an idempotent state transition or a unique composite-key upsert, don't overcomplicate it. You don't need an idempotency engine.

---

## Pattern 2: The ACID Idempotency Engine

When an endpoint touches multiple tables, produces audit logs, or charges money, you need an atomic idempotency record.

Here is a schema that has survived heavy production traffic:

```sql
CREATE TABLE idempotency_records (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    request_path    VARCHAR(255) NOT NULL,
    request_hash    CHAR(64) NOT NULL,       -- SHA-256 of request payload
    status          VARCHAR(32) NOT NULL,    -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    response_code   INT NULL,
    response_body   JSONB NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_records_created_at 
ON idempotency_records (created_at);
```

### The Request Lifecycle

The claim row and the business writes go in **one transaction**. That has a consequence that's easy to get wrong: nobody outside that transaction ever sees the row as `IN_PROGRESS`. Until request A commits, its claim is invisible.

So what does a duplicate actually hit? The primary key. When request B runs `INSERT ... ON CONFLICT DO NOTHING` for a key that A has inserted but not committed, Postgres can't tell yet whether A's row will exist, so B **waits** for A to finish. Then it reports the conflict, and B replays whatever A stored.

```text
Request A (key "abc")                       Request B (same key, 300 ms later)
─────────────────────                       ──────────────────────────────────
BEGIN                                       BEGIN
INSERT claim ... ON CONFLICT DO NOTHING
  → 1 row (visible only to A)
run the transfer (balances, ledger)         INSERT claim ... ON CONFLICT DO NOTHING
                                              → blocks on A's uncommitted row
UPDATE claim SET status = 'COMPLETED',
  response_code = 201, response_body = ...
COMMIT ───────────────────────────────────►   → 0 rows (conflict)
201 Created                                 SELECT stored response; COMMIT
                                            request_hash differs → 422
                                            request_hash matches → replay the 201
```

Two other endings are worth knowing. If A rolls back, B's insert succeeds and B runs the transfer itself, which is what you want after a failure. If A takes longer than B is willing to wait, B gives up with a lock timeout, and that's the only point where returning `409` makes sense.

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

## Pattern 3: Two-Phase External API Calls (Stripe, Twilio)

What happens when your endpoint has to talk to an external third-party API, like charging a card via Stripe or sending an SMS?

You cannot roll back a credit card charge with a database `ROLLBACK`.

If your server charges Stripe and then crashes before committing to PostgreSQL, the customer was billed, but your database says the order failed. If the client retries, a naive worker will charge them again.

To fix this:

1. **Derive Downstream Keys Deterministically:** Never generate a random `crypto.randomUUID()` when calling Stripe. Instead, derive the third-party idempotency key directly from your incoming request key:
   ```typescript
   const stripeKey = `charge_${incomingIdempotencyKey}`;
   
   const charge = await stripe.charges.create(
     { amount: 5000, currency: "usd", customer: customerId },
     { idempotencyKey: stripeKey }
   );
   ```
2. **Intent Before Execution:** Save a pending payment record in PostgreSQL *before* calling Stripe. If the external network call drops or times out, the retry uses the same deterministic `stripeKey`. Stripe's API will recognize the duplicate key and safely return the existing charge object instead of billing twice.

This is the one place a visible `IN_PROGRESS` row is real. You can't hold a database transaction open across a call to Stripe, so the claim has to be committed on its own first, and then other requests can see it. A duplicate that finds it should get a `409` with `Retry-After`. You also need a way out for a claim whose process died mid-call: a `claimed_at` column and a sweeper that, after some timeout, retries with the same `stripeKey` instead of assuming the charge failed.

---

## Production Gotchas You Only Learn at 2 AM

### 1. The Accidental Key Reuse Bug
Clients have bugs. Frontends occasionally hardcode a test UUID or generate a key on page load instead of on form submission. A user buys item A, navigates back, and buys item B under the same key.

If you only check that the key exists and return the cached response, the user gets charged for item B, gets item A's receipt, and your database ends up in an inconsistent mess.

**The rule:** Always verify the SHA-256 hash of the payload against the stored record. If the key matches but the hash doesn't, immediately reject the call with `422 Unprocessable Entity`.

### 2. Never Cache 500 Internal Server Errors
If your database connection pool gets exhausted or an internal service times out, your server throws a 500.

If your idempotency layer catches that 500 and records it as `COMPLETED`, you have just permanently locked that user out. Every automated retry with exponential backoff will faithfully return the cached 500 error.

Only cache successful mutations (`2xx`) and deterministic client validation errors (`4xx`). In the single-transaction version above, the `ROLLBACK` takes care of this: the claim disappears with everything else. In the two-phase version below, the claim is already committed, so you have to delete or expire it yourself.

### 3. The 200ms Mobile Retry Stampede
Mobile apps on flaky connections often fire duplicate retries aggressively. If your timeout is 250ms and your database takes 300ms under load, the second request will hit your server while the first request is still writing.

Without a database-level unique constraint or an atomic lock, both requests will run in parallel, both will pass the "no record found" check, and both will execute.

Rely on `ON CONFLICT DO NOTHING` on the primary key and let the database serialize them. The runner-up doesn't get an immediate error. It waits on the winner's uncommitted row, then replays the stored response. Put a `lock_timeout` on that wait so one slow request can't pin a stack of pooled connections, and return `409` with `Retry-After` when it fires.

---

## What Actually Matters in Production

Building reliable distributed systems comes down to three operational rules:

1. **Keep state together:** Never store idempotency tokens in an in-memory cache while your business data lives in PostgreSQL. When the process crashes between them, your data corrupts.
2. **Hash the payload:** An idempotency key without a payload hash check is an invitation for silent data corruption.
3. **Plan for table growth:** Idempotency tables collect massive volume quickly. Partition by month or run a scheduled cleanup job deleting records older than 30 days. After a month, an in-flight retry is no longer a retry; it's a completely new business event.

One more that is specific to the key-derivation step in Pattern 3: if you derive
the upstream call's idempotency key from the incoming one
(`charge_${incomingKey}`), you are depending on that provider's key-retention
window. Stripe retains idempotency keys for **24 hours**; after that, a replayed
request with the same key is treated as a brand-new charge. That is longer than
most retry windows and comfortably longer than gateway timeouts, so it is
usually safe — but it is a dependency with an expiry date, and it is different
for every provider. Check the retention window before you rely on it, and do not
assume it is unbounded because nothing has failed yet.

---

## Series Navigation

This is **Part 3** of a three-part series on reliable event-driven systems:

1. **[Message Queues, Topics, and Event Streams](/blog/message-queues-topics-event-streams-explained)** — transport primitives and what each delivery guarantee actually means.
2. **[The Transactional Outbox Pattern](/blog/transactional-outbox-pattern-production-realities)** — getting events into the broker without a dual-write gap.
3. **Idempotency in Distributed Systems** (you are here) — surviving the duplicates that at-least-once guarantees will hand you.
