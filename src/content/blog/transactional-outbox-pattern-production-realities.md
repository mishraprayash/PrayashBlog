---
title: "The Transactional Outbox Pattern: Why Your 100-Line Node.js Script Will Break in Production"
slug: "transactional-outbox-pattern-production-realities"
description: "A home-made Postgres outbox skips events under concurrency, bloats when vacuum is held back, stalls when you drop old partitions, and a CDC relay can fill the disk and take the primary down. Each failure reproduced on Postgres 16, with the fix."
publishDate: "2026-09-09T23:15:00Z"
updatedDate: "2026-10-18T10:00:00Z"
updateSummary: "Rewritten. Every failure in the post is now reproduced on Postgres 16 with the output shown. New sections on what actually stops vacuum from cleaning the table and why dropping a partition can stall the poller. Fixed the worker-sharding query (`% 4` skipped about a third of events) and the consumer example, which could lose or double-process an event if the process died mid-way."
author: "Prayash Mishra"
pillar: "messaging"
tags: ["postgresql", "kafka", "microservices"]
series: "reliable-messaging"
seriesPart: 2
startHere: 1
draft: false
---

This code has a bug that won't show up in review or in staging:

```ts
await db.orders.create({ data: order });
await kafka.send({ topic: "orders", messages: [{ value: JSON.stringify(order) }] });
```

If the Kafka call fails after the insert has committed, the order exists and nothing downstream hears about it. Billing never charges and inventory never reserves. There's no error anywhere either, because from the point of view of the code that made it, the database write succeeded. Swapping the two lines just moves the problem: now you can publish an event for an order that was never saved.

The usual answer is the transactional outbox. You write the event into an `outbox` table in the same transaction as the order, and a separate relay reads that table and publishes to the broker. The database transaction becomes the single commit point, and the relay can retry until the broker takes the message.

On a whiteboard that's a table and a loop. [TODO: one sentence on where you built this, e.g. "On the order service I was working on, the first version was a `setInterval` and about a hundred lines of TypeScript."] What follows is how that version fails, roughly in the order you'll meet the failures. Every one of them is reproduced below on PostgreSQL 16.

This assumes you already know what the outbox pattern is and you're about to build one on Postgres, or you're running one and something about it worries you.

## 1. The poller that skips rows

The obvious relay remembers the highest id it has published and asks for anything newer:

```sql
SELECT * FROM outbox WHERE id > :last_seen_id ORDER BY id LIMIT 100;
```

It loses events whenever two transactions commit in a different order from the one they got their ids in. A sequence hands out ids when a row is inserted, not when the transaction commits:

1. Transaction A inserts an outbox row and gets `id = 1`, then carries on with other work.
2. Transaction B inserts a row, gets `id = 2`, and commits straight away.
3. The relay runs. Under `READ COMMITTED` it can only see committed rows, so it sees `2`, publishes it, and records `last_seen_id = 2`.
4. A commits. Its row, `id = 1`, is now visible.
5. The next poll asks for `id > 2`. Row 1 is never published.

Here it is with two `psql` sessions, A holding its transaction open for two seconds:

```console
poller sees: 2:B: fast txn
next poll (id > 2): []
rows in table: 1:A: slow txn, 2:B: fast txn
```

Nothing errors and nothing is logged. You find out when someone asks why an order never shipped.

### The fix: poll by state, not by position

Ask for what hasn't been published yet, instead of what comes after the last thing you saw:

```sql
SELECT id, aggregate_id, payload
FROM outbox
WHERE status = 'PENDING'
ORDER BY id
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Two separate things are going on in that query, and they're easy to confuse. `status = 'PENDING'` fixes the skipped row: A's row is still pending when it becomes visible, so the next poll picks it up. `FOR UPDATE SKIP LOCKED` is what lets you run more than one relay. Each relay locks the rows it took, and the others step over them instead of waiting. With six pending rows and two relays polling at the same moment:

```console
relay 1 got: 1,2,3,4
relay 2 got: 5,6
```

Give the query a partial index so it doesn't have to wade through published rows:

```sql
CREATE INDEX outbox_pending ON outbox (id) WHERE status = 'PENDING';
```

`ORDER BY id` here is a rough order, not commit order, for the same reason the cursor broke. That matters once you care about ordering per order or per customer, which is section 3.

## 2. Bloat, and what actually stops vacuum

Marking a row as published is an `UPDATE`, and deleting it is a `DELETE`. Either way Postgres doesn't change the row in place. MVCC keeps the old version around as a dead tuple until vacuum decides nobody can still see it. At 100 events a second that's 8.6 million dead tuples a day in one small table.

Autovacuum usually keeps up with that, as long as it's allowed to remove what it finds. It isn't allowed to remove a dead tuple that some open transaction might still need to read. A single long transaction anywhere in the database holds back what vacuum can clean in every table. Here the outbox has 10,000 freshly deleted rows, and one session has a `REPEATABLE READ` transaction open:

```console
tuples: 0 removed, 10002 remain, 10000 are dead but not yet removable
```

Vacuum ran, found everything, and removed nothing. Once that one transaction ended:

```console
tuples: 10000 removed, 2 remain, 0 are dead but not yet removable
```

So when an outbox table keeps growing, look for what's holding the horizon back before you start tuning autovacuum. The usual suspects are a long-running report, a session left `idle in transaction` by an application that forgot to commit, and a replica with `hot_standby_feedback = on` running a long query. This shows the oldest snapshots still open:

```sql
SELECT pid, state, now() - xact_start AS xact_age, backend_xmin, left(query, 60) AS query
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC
LIMIT 5;
```

Setting `idle_in_transaction_session_timeout` stops the forgotten-commit case from lasting more than a few minutes.

Once nothing is holding vacuum back, tune it for this table so it runs more often than the defaults allow:

```sql
ALTER TABLE outbox SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_limit = 1000
);
```

### Partition by time and drop old partitions, carefully

At higher volume, stop deleting rows at all. Partition the outbox by `created_at` (`pg_partman` will create the partitions for you), and get rid of an old partition once everything in it is published. Dropping a table creates no dead tuples and returns the space immediately.

The catch is in how you drop it. `DROP TABLE` on a partition takes an `ACCESS EXCLUSIVE` lock on the parent table as well, and it has to wait for anyone currently reading the parent. While it waits, every new query on the parent queues behind it. With one long-running reader on the parent, a `DROP` of an old partition, and then an ordinary poller query, `pg_locks` on the parent looked like this (trimmed, with notes on the right):

```console
ob     | AccessShareLock     | granted     ← the long-running reader
ob     | AccessExclusiveLock | waiting     ← DROP TABLE ob_old
ob     | AccessShareLock     | waiting     ← the poller, stuck behind the DROP
new poller query on parent finished after 3.04s
```

The poller was stuck for as long as the reader ran. Detach the partition first with `CONCURRENTLY` (Postgres 14 and later), then drop the detached table, which no longer has anything to do with the parent:

```sql
ALTER TABLE outbox DETACH PARTITION outbox_2026_09_09 CONCURRENTLY;
DROP TABLE outbox_2026_09_09;
```

Same setup, same long reader:

```console
new poller query on parent finished after .036s
```

`DETACH … CONCURRENTLY` still waits for the reader to finish, but it waits without blocking anyone else. It can't run inside a transaction block, so run it from a maintenance job, not from inside your migration framework's transaction.

## 3. Out-of-order events

Run four relays to keep up, and a customer places an order and cancels it a moment later:

1. `OrderCreated` is written (row 1).
2. `OrderCancelled` is written 50 ms later (row 2).

Relay A takes row 1 and relay B takes row 2. A hits a slow Kafka reconnect or a pause in the event loop, and B publishes straight away. Consumers see `OrderCancelled` before `OrderCreated`, look up an order that doesn't exist yet, and the event goes round the retry loop into the dead-letter queue.

If events for the same entity must arrive in order, one relay has to own that entity. Hash the aggregate id and give each relay one bucket:

```sql
WHERE status = 'PENDING'
  AND (hashtext(aggregate_id) & 3) = :worker_index   -- 4 relays, buckets 0..3
```

Use `& 3`, not `% 4`. `hashtext()` returns a signed 32-bit integer, and Postgres's `%` keeps the sign of the left side, so `hashtext(x) % 4` lands anywhere from -3 to 3. No relay ever asks for bucket -2, so those rows are never published, and nothing errors. Over 10,000 sample keys, `% 4` left 3,721 rows (37%) with no owner. `& 3` split the same keys 2,550 / 2,411 / 2,531 / 2,508. The mask only works when the number of relays is a power of two, so keep it one.

Changing the number of relays moves almost every aggregate to a different bucket. During a rollout from 4 to 8, an old and a new relay can both own the same order. Drain the pending rows, or stop the old relays, before the new ones start.

Then use `aggregate_id` as the Kafka message key, so every event for an order lands in the same partition and consumers read them in the order they were published. The key doesn't replace the bucketing. If two relays publish one order's events out of sequence, Kafka will store them out of sequence, faithfully.

## 4. Change data capture and the full disk

When the polling gets annoying, someone suggests Debezium: read the write-ahead log directly, no polling queries at all. It works well. It also creates a logical replication slot, and a replication slot is a promise. Postgres keeps every WAL segment the slot hasn't confirmed, however long that takes.

So the failure goes like this. The connector stops, because of a schema change it can't parse, a Kafka outage, or a deploy that didn't come back. The slot stops advancing. The application keeps writing, Postgres keeps every WAL file, and eventually the WAL volume fills. Reproduced on a small volume, with a slot that nobody reads from:

```console
ERROR:  could not write to file "pg_wal/xlogtemp.4523": No space left on device
PANIC:  could not write to file "pg_wal/xlogtemp.4550": No space left on device
LOG:  server process (PID 4550) was terminated by signal 6: Aborted
LOG:  all server processes terminated; reinitializing
FATAL:  the database system is in recovery mode
```

After that it doesn't come back on its own, because crash recovery needs to write WAL too. Your whole API is down because of a connector that was meant to be a side channel.

### The fix: a ceiling on what a slot can hold

Since Postgres 13, `max_slot_wal_keep_size` caps how much WAL a slot can keep:

```ini
max_slot_wal_keep_size = 20GB
```

Past the cap, Postgres gives up on the slot instead of on the database. With a 64 MB cap and the same stalled slot, the slot's `wal_status` went from `reserved` to `lost`, and the server logged:

```console
LOG:  invalidating obsolete replication slot "debezium"
DETAIL:  This slot has been invalidated because it exceeded the maximum reserved size.
HINT:  You might need to increase max_slot_wal_keep_size.
```

The connector will need a fresh snapshot when it comes back, which is slow and annoying, but the primary stays up. Pick the cap from your disk size and how long you'd want to give someone to fix the connector at your write rate. Then alert well before you reach it:

```sql
SELECT slot_name,
       wal_status,
       pg_size_pretty(safe_wal_size) AS headroom,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM pg_replication_slots;
```

`wal_status` moves from `reserved` to `extended` to `unreserved` as a slot falls behind. Page someone at `extended`.

## 5. The outbox only covers the publishing side

The outbox gives you at-least-once delivery, not exactly-once. The relay publishes, Kafka acknowledges, and then the relay's process dies before it marks the row as published. On restart the row is still pending, and it goes out again.

So every consumer has to cope with seeing an event twice. The usual way is to record each event id you've handled, with a unique constraint, and claim the id before doing the work. A plain insert isn't quite enough on its own. If the consumer claims an event and then crashes before finishing, the claim stays forever and every redelivery skips the event. Give the claim a lease, so a claim that's been in progress for too long can be taken over:

```sql
INSERT INTO processed_events (event_id, status, claimed_at)
VALUES ($1, 'IN_PROGRESS', now())
ON CONFLICT (event_id) DO UPDATE SET claimed_at = now()
  WHERE processed_events.status = 'IN_PROGRESS'
    AND processed_events.claimed_at < now() - interval '5 minutes'
RETURNING event_id;
```

A row back means you own the event. No row means someone else has it, or it's done. Run against Postgres 16:

```console
first delivery              -> [evt-1]
redelivery, claim is fresh  -> []
redelivery, claim is stale  -> [evt-1]   the consumer that claimed it is presumed dead
redelivery, already done    -> []
```

The lease has one consequence you have to deal with: a takeover means the side effect may already have happened. If it's a database write, put it in the same transaction as the claim and the problem goes away. If it's an external call, such as a payment or an email, pass the event id to the provider as its idempotency key, so a second attempt returns the first result instead of charging twice. When the work finishes, set `status = 'COMPLETED'`.

The consumer side gets a full post of its own: [Idempotency in Distributed Systems](/blog/idempotency-in-distributed-systems), including why that state belongs in Postgres next to your data rather than in Redis.

## Where to start

- **Start with polling.** Use `status = 'PENDING'` and `FOR UPDATE SKIP LOCKED`, with the partial index. It's easy to reason about and easy to fix at 2 a.m.
- **Watch the xmin horizon before you tune vacuum.** Set `idle_in_transaction_session_timeout`.
- **Partition once the delete rate shows up in your vacuum stats**, and drop old partitions with `DETACH … CONCURRENTLY` first.
- **Bucket by aggregate** only if consumers need per-entity order, and use `&`, not `%`.
- **Move to CDC** when the polling queries show up near the top of `pg_stat_statements`, or when you need lower latency than your poll interval. Set `max_slot_wal_keep_size` before the first slot exists, not after the first outage.
- **Make every consumer idempotent**, whichever relay you pick.

[TODO: if you hit any of these in production, one or two sentences on which one and how you noticed. That's worth more to a reader than anything above.]

## Further reading

- PostgreSQL docs: [the locking clause, including `SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- PostgreSQL docs: [routine vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html)
- PostgreSQL docs: [`ALTER TABLE … DETACH PARTITION … CONCURRENTLY`](https://www.postgresql.org/docs/current/sql-altertable.html)
- PostgreSQL docs: [`max_slot_wal_keep_size`](https://www.postgresql.org/docs/current/runtime-config-replication.html#GUC-MAX-SLOT-WAL-KEEP-SIZE)
- [Debezium PostgreSQL connector](https://debezium.io/documentation/reference/stable/connectors/postgresql.html)
- The transport underneath all of this: [Message Queues, Topics, and Event Streams](/blog/message-queues-topics-event-streams-explained)
