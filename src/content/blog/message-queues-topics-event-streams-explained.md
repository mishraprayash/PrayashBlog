---
title: "Message Queues, Topics, and Event Streams Explained: How They Differ and When to Use Each"
slug: "message-queues-topics-event-streams-explained"
description: "A practical, experience-driven guide to messaging patterns: what actually separates queues, pub/sub topics, and event streams, where the lines blur, and how to choose between them."
publishDate: "2026-08-25T10:00:00Z"
updatedDate: "2026-09-09T22:50:00Z"
updateSummary: "Refactored to be significantly more compact and experience-driven: removed textbook definitions, focused on practical trade-offs (consumer models, retention, ordering, and redeliveries), and streamlined the decision guide."
author: "Prayash Mishra"
tags: ["architecture", "backend", "distributed-systems", "microservices", "kafka", "rabbitmq", "aws"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Comparison architecture diagram showing Message Queues, Pub/Sub Topics, and Event Streams"
draft: false
---

Early in my backend engineering career, terms like **Queue**, **Topic**, **Pub/Sub**, and **Stream** all sounded like minor variations of the same thing: *a box in the middle where you drop a message and someone else picks it up asynchronously*.

In practice, that vagueness leads to very real architectural friction:
* Reaching for Redis `PUBLISH`/`SUBSCRIBE` because Redis is already in the stack as a cache, only to discover that disconnected subscribers silently drop messages during deployments or network blips.
* Introducing a streaming platform like Kafka for simple background jobs (like sending emails or syncing records), only to spend weeks wrestling with partition counts, consumer group rebalances, and offset commits for a workload that just needed a basic task queue.
* Assuming a queue guarantees that every task runs exactly once, only to find duplicate charges or duplicate emails in production because a slow worker exceeded its visibility timeout before acknowledging.

The root cause of this confusion is simple: **conflating architectural messaging patterns with the tools that implement them.**

A queue is not SQS; a stream is not Kafka; a topic is not SNS. A queue is an abstract pattern for distributing work; a stream is an abstract pattern for an append-only log. Many modern tools can actually implement or emulate multiple patterns depending on how you configure them.

Here is the mental model I now use, the subtle trade-offs that actually matter in production, and how I decide between them.

---

## 1. The Mental Model I Use

Whenever I evaluate a messaging problem, I strip away vendor marketing and reduce it to one of three intents:

```
1. Queue   → Work Distribution  ("Take this task, do it once, and let me know when it's done.")
2. Pub/Sub → Fan-out Broadcast  ("Something happened. I am announcing it to whoever cares.")
3. Stream  → Retained Timeline  ("Here is an immutable log of events. Read at your pace, and rewind if needed.")
```

* **The Message Queue (Work Distribution)**: Built around **competing consumers**. A producer pushes tasks into a buffer. A pool of workers pull from the queue, but **only one worker processes any given task**. When that worker signals success (`ACK`), the message is removed. The goal is load-balancing work across compute resources.
* **The Pub/Sub Topic (Fan-out Broadcast)**: Built for **one-to-many announcements**. A publisher emits an event to a topic. The broker duplicates that event to **every registered subscriber**. The publisher has zero awareness of who is listening, and subscribers operate completely decoupled from one another.
* **The Event Stream (Retained Timeline)**: Built as a **partitioned, append-only commit log on disk**. Records are not deleted when read. The broker assigns each record a sequential ID (**offset**). Consumers independently track their own position in the log, meaning different services can read the exact same stream at completely different speeds.

---

## 2. Where the Distinctions Blur in Real Systems

What confused me initially was seeing senior engineers use tools in ways that seemed to contradict these definitions. That happens because production tools frequently combine these primitives:

* **RabbitMQ** is famous as a message queue, but producers never publish directly to queues; they publish to an **Exchange**. A fanout exchange clones messages to multiple bound queues—turning a queue broker into a full **Pub/Sub** system.
* **Apache Kafka** is an append-only log, but when multiple consumer instances share the same `group.id`, Kafka balances topic partitions among them. Each partition is assigned to only one worker in the group—effectively turning an event stream into a **work queue**.
* **Google Cloud Pub/Sub** and **Azure Service Bus** are called "Pub/Sub", but their subscriptions operate like persistent, pull-based queues with individual message leases, dead-lettering, and redeliveries.

The lesson: **Don't ask *"Is Kafka better than RabbitMQ?"* Ask *"Does my workload require work distribution, fan-out broadcast, or durable timeline replay?"***

---

## 3. The 4 Practical Differences That Actually Matter

Once you look past the APIs, there are only four architectural mechanics that truly govern how these systems behave under load.

### 1. The Consumer Model: Competing Workers vs. Offset Pointers
* **In a Queue**: The broker actively manages message state. When Worker A pulls `Task 1`, the broker temporarily hides or locks it. If Worker A finishes, it sends an `ACK`, and the broker deletes it. If you have 50 workers, they dynamically compete for tasks as capacity allows.
* **In a Stream**: The broker doesn't track per-message delivery state; it just stores bytes on disk. Consumers maintain an **offset** (a bookmark) indicating how far they have read. This gives streams blistering throughput (millions of events/sec), but introduces a critical constraint: **concurrency within a consumer group is strictly bounded by the number of partitions**. If a Kafka topic has 8 partitions, an 8-node consumer group uses all 8 nodes; add a 9th node, and it sits idle with zero work.

### 2. Retention & Replay: Disposable Buffers vs. Time Travel
* **In a Queue**: Reading is lifecycle-terminal. Once a message is acknowledged, it is purged. If you write a new reporting service tomorrow, it cannot retroactively inspect last month's queue messages.
* **In a Stream**: Reading is completely non-destructive. Events are retained based on time (e.g., 7 days) or size. If you deploy a new recommendation service, you can set its consumer offset to `0` and **replay months of raw history** to bootstrap its database.
* **Pub/Sub Nuance**: Ephemeral pub/sub (like Redis `PUBLISH`/`SUBSCRIBE`) drops messages if a subscriber is offline for even 100 milliseconds. Modern enterprise pub/sub (like GCP Pub/Sub or AWS SNS backed by SQS) uses **durable subscriptions** that persist backlogs until acknowledged, with some even allowing time-based seeking.

### 3. Ordering: Scoped Partitions vs. The "Global FIFO" Myth
A common trap I see engineers fall into is demanding "strict chronological FIFO ordering across 50,000 messages per second."

In distributed systems, strict global ordering requires serializing all writes through a single coordinator, destroying horizontal scalability. In practice, ordering is always **scoped**:
* **In Streams (Kafka / Kinesis)**: Ordering is guaranteed strictly **within a single partition**, dictated by the broker's append sequence. 
* **Watch out**: Broker partition order is **not necessarily business-time order**. If a client's network connection drops and retries an event from `12:00:01`, a subsequent event from `12:00:02` might reach the broker first and receive a lower offset.
* **In Queues (e.g., SQS FIFO)**: Ordering is scoped to a `MessageGroupId`. Messages with the same group ID process strictly in order; messages with different IDs run concurrently across worker pools.

### 4. Failure & Delivery Semantics: Why "Exactly-Once" is on You
No message broker on earth provides pure end-to-end "exactly-once delivery" across unreliable networks without application coordination:

```
At-Most-Once            At-Least-Once                  "Effectively-Once"
(Fire & Forget)         (Standard Industry Default)    (At-Least-Once + Idempotent Consumer)
   │                           │                                │
   ▼                           ▼                                ▼
Lost packets = lost data.  Network blip on ACK = redelivery. Duplicate arrivals handled safely.
Low latency, zero retry.   Safe against data loss.      Safe, correct, production-grade.
```

In standard queues and streams, **at-least-once delivery is the reality**. If a worker executes a payment task and crashes right before sending the ACK, the broker redelivers the message to another worker.

The only way to achieve reliable processing is **application-level idempotency**:

```typescript
async function processPayment(job: { id: string; orderId: string; amount: number }) {
  // 1. Guard against redelivered duplicates via unique constraint
  const existing = await db.processedJobs.findUnique({ where: { jobId: job.id } });
  if (existing) return; // Safe no-op ACK

  // 2. Execute side effect and record completion atomically
  await db.$transaction(async (tx) => {
    await tx.processedJobs.create({ data: { jobId: job.id, completedAt: new Date() } });
    await chargeStripeCustomer(job.orderId, job.amount);
  });
}
```

* **Throughput Buffering & Backpressure**: Queues act as shock absorbers. When an upstream service spikes to 10,000 requests/sec, the queue buffers the surge. Workers continue pulling at a stable, rate-limited pace (e.g., 100/sec), preventing downstream relational databases from falling over.

---

## 4. Two Real-World Architecture Patterns I Use Most

### Pattern 1: The Topic-to-Queue Fan-Out (e.g., SNS → SQS)

In microservice architectures, you should almost never have a Pub/Sub topic invoke service HTTP webhooks directly. A sudden spike in signups will overwhelm downstream endpoints, and if an endpoint is temporarily down, the event is lost.

The battle-tested solution is the **Topic-to-Queue Fan-Out**:

```
                            ┌───────────────────────────────────┐
                            │    AWS SNS Topic (user.created)   │
                            └─────────────────┬─────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │    Email Worker Queue   │                       │   Billing Worker Queue  │
        │        (AWS SQS)        │                       │        (AWS SQS)        │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     ▼                                                 ▼
        [ Email Worker Pool ]                             [ Billing Worker Pool ]
        (Consumes at: 50 msg/sec)                         (Consumes at: 5 msg/sec)
```

**Why this works so well:**
1. **Fault Isolation**: If the billing database crashes, the `Billing SQS Queue` safely buffers messages for days. The `Email Service` continues uninterrupted.
2. **Independent Rate Limiting**: Email workers can burst to 50 tasks/sec, while billing workers throttle to 5 tasks/sec to respect external payment gateway rate limits.
3. **Independent Dead Letter Queues**: Poison pills in one subscriber don't affect any other system.

### Pattern 2: Kafka Consumer Groups as an Ordered Work Queue

When you need both **high-throughput work distribution** and **per-entity sequential ordering**, Kafka consumer groups shine:

```
                             ┌───────────────────────────────────┐
                             │     Kafka Topic (4 Partitions)    │
                             │   [P0]     [P1]     [P2]     [P3] │
                             └─────┬────────┬────────┬────────┬──┘
                                   │        │        │        │
                                   ▼        ▼        ▼        ▼
                      ┌──────────────────────────────────────────────┐
                      │        Consumer Group: "ledger-workers"      │
                      │   Worker 1 ◄── [P0, P1]                      │
                      │   Worker 2 ◄── [P2, P3]                      │
                      └──────────────────────────────────────────────┘
```

By partitioning on `accountId`, all transactions for Account #123 land in the same partition and are processed strictly in arrival order by one worker. Meanwhile, transactions for Account #456 run concurrently on another worker.

**The catch to watch out for**: Be cautious with tasks that have wildly unpredictable execution times (e.g., a fast cache sync vs. a heavy report export). Because a partition is strictly sequential, a single slow task stalls all subsequent tasks assigned to that partition (**head-of-line blocking**). For tasks with high variance in runtime, a dynamic message queue (SQS, BullMQ) distributes work much more smoothly.

---

## 5. How I Choose: A Practical Guide

Instead of memorizing complex vendor comparison matrices, I walk through these four questions:

```
                  ┌────────────────────────────────────────────────────────┐
                  │ Do multiple independent services need this message?     │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                              YES ────────────┴──────────── NO
                               │                             │
                               ▼                             ▼
                  [ Fan-Out / Pub-Sub Topic ]   [ Need replayability or high- ]
                  (AWS SNS, GCP Pub/Sub)        [ throughput partition ordering? ]
                                                             │
                                             YES ────────────┴──────────── NO
                                              │                             │
                                              ▼                             ▼
                                     [ Event Stream ]             [ Message Queue ]
                                     (Kafka, Redpanda)            (SQS, RabbitMQ, BullMQ)
```

### 1. What is the fundamental intent?
* If you need to **distribute discrete jobs** to a pool of workers with individual ACKs and independent retries: **Choose a Message Queue** (SQS, RabbitMQ, BullMQ).
* If you need to **broadcast an announcement** to decoupled systems: **Choose a Pub/Sub Topic** (AWS SNS, Google Cloud Pub/Sub). *Rule of thumb*: subscribe queues to that topic for heavy consumers.
* If you need to **record an ordered sequence of state changes** that multiple consumers read at different speeds and replay on demand: **Choose an Event Stream** (Kafka, Redpanda).

### 2. What happens when task runtimes vary widely?
* If tasks have **unpredictable or variable execution times** (e.g., 50ms vs. 30 seconds), stick with a **Message Queue**. Idle workers dynamically pull tasks as capacity frees up without getting stuck behind a slow job.
* If you route variable-duration tasks into an **Event Stream**, a slow task in a partition stalls all subsequent events assigned to that partition.

### 3. Will you ever need to rewind and re-read data?
* If yes, you need an **Event Stream**. Message queues permanently discard data on ACK.

### 4. Is the stream your "Source of Truth"?
* Remember that an event stream doesn't have to be the single source of truth for your entire company. In most mature architectures, a relational database (PostgreSQL) remains the transactional system of record, while Kafka or Kinesis serves as an event transport backbone fed via Change Data Capture (CDC / Debezium).

---

## The Takeaway

The biggest mental shift is realizing that **messaging systems are defined by their consumption and retention models, not their brand names**.

* If you care about **task completion**, you want a **Queue**.
* If you care about **broadcasting facts**, you want **Pub/Sub**.
* If you care about **durable history and ordered playback**, you want a **Stream**.

Start with the simplest model that satisfies your requirements. For 80% of backend workloads, a managed message queue like SQS or BullMQ paired with a Pub/Sub topic will take you surprisingly far—without the operational complexity of maintaining distributed stream clusters.
