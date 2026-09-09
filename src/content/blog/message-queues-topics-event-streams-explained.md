---
title: "Message Queues, Topics, and Event Streams Explained: How They Differ and When to Use Each"
slug: "message-queues-topics-event-streams-explained"
description: "Point-to-point queues, publish-subscribe topics, and append-only event streams demystified: consumer semantics, retention mechanics, real-world failure modes, and code examples."
publishDate: "2026-08-25T10:00:00Z"
updatedDate: "2026-09-09T22:45:00Z"
updateSummary: "Refined with precise distributed systems semantics: clarified acknowledgment & redelivery, durable vs ephemeral pub/sub, partition-scoped ordering vs business time, delivery guarantees (at-least-once & idempotency), throughput buffering, and expanded the 5 core misconceptions."
author: "Prayash Mishra"
tags: ["architecture", "backend", "microservices", "kafka", "rabbitmq", "aws"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Comparison architecture diagram showing Message Queues, Pub/Sub Topics, and Event Streams"
draft: false
---

In distributed systems engineering, few terms are as overloaded and conflated as **messaging**. 

Developers frequently use the words **Queue**, **Topic**, **Pub/Sub**, and **Stream** interchangeably. When an engineering team confuses these concepts, the fallout usually shows up directly in production:
* Deploying a multi-broker Apache Kafka cluster just to dispatch welcome emails and password resets.
* Using an ephemeral Redis Pub/Sub channel for billing notifications, dropping invoices whenever a subscriber container restarts during a rolling deployment.
* Routing variable-duration video encoding jobs through a Kafka partition, causing catastrophic head-of-line blocking for thousands of fast jobs trapped behind a 4-hour render.

The root cause of these mistakes is failing to distinguish between **architectural messaging patterns** and the **concrete technologies** that implement them.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                ARCHITECTURAL PATTERNS                                  │
│                                                                                        │
│   ┌─────────────────────┐    ┌─────────────────────┐    ┌──────────────────────────┐   │
│   │    MESSAGE QUEUE    │    │    PUB/SUB TOPIC    │    │       EVENT STREAM       │   │
│   │ (Work Distribution) │    │  (1-to-Many Fanout) │    │ (Durable History & Log)  │   │
│   └──────────┬──────────┘    └──────────┬──────────┘    └────────────┬─────────────┘   │
└──────────────┼──────────────────────────┼────────────────────────────┼─────────────────┘
               │                          │                            │
               ▼                          ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              CONCRETE TECHNOLOGIES / TOOLS                             │
│                                                                                        │
│   AWS SQS · BullMQ · RabbitMQ · AWS SNS · Google Cloud Pub/Sub · Apache Kafka · Redpanda│
│   (Note: Many modern tools implement or combine more than one pattern!)                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

A **Queue** is an abstract pattern for point-to-point work distribution. An **Event Stream** is an abstract pattern for an append-only commit log. A single tool (such as RabbitMQ or Kafka) can often implement or emulate multiple patterns depending on how its consumers and storage are configured.

Here is the first-principles breakdown of the three core paradigms, their internal mechanics, delivery semantics, real-world failure modes, and a requirements-driven decision framework.

---

## 1. Layer 1: The Three Core Mental Models

To choose the right tool, you first need clear mental models of what each paradigm is designed to accomplish.

```
1. Message Queue:  "Distribute tasks among a pool of workers so only one worker handles each task at a time (though failures trigger redelivery, requiring idempotency)."
2. Pub/Sub Topic:  "Broadcast an event announcement to multiple independent subscribers."
3. Event Stream:   "Append ordered events to an immutable log with independent consumer progress and replay capabilities."
```

| Dimension | Message Queue | Pub/Sub Topic | Event Stream |
| :--- | :--- | :--- | :--- |
| **Core Purpose** | **Work distribution** (competing consumers) | **Broadcast fan-out** (1-to-many announcements) | **Durable timeline & stream processing** |
| **Message Nature** | Imperative task or command | Event or notification | Immutable state change or event record |
| **Consumer Topology** | Competing consumers (load-balanced across workers) | Independent subscribers (each gets its own logical stream) | Consumer groups tracking independent log offsets |
| **Read Lifecycle** | Acknowledged removal (leased -> deleted on ACK) | Acknowledged per-subscription (durable) or fire-and-forget (ephemeral) | Non-destructive read (offset advancement; log is retained) |
| **Storage & Retention** | Ephemeral buffer (cleared as tasks are acknowledged) | Varies by tool: ephemeral (Redis) to durable with retention (GCP Pub/Sub, Azure Service Bus) | Durable append-only log with configurable retention (time, size, or key compaction) |
| **Historical Replay** | ❌ None (messages deleted on ACK) | ⚠️ Implementation-dependent (supported via seek in GCP Pub/Sub; absent in ephemeral brokers) | ✅ Native (any consumer can rewind its offset) |
| **Ordering Scope** | Best-effort FIFO (or scoped via Message Group ID) | Scoped or none (depends on broker and subscription model) | Strictly guaranteed **within a partition** (by log offset) |
| **Delivery Semantics** | At-least-once (redelivered on worker/ACK failure) | At-least-once (durable) or at-most-once (ephemeral) | At-least-once (redelivered on uncommitted offset) |

---

## 2. Layer 2: Core Mechanics & Storage Under the Hood

### Paradigm 1: The Message Queue (Point-to-Point Work Distribution)

A **Message Queue** coordinates asynchronous task execution among a pool of **competing consumers**. The primary goal is **work distribution**: dividing a stream of discrete jobs across available worker processes.

```
┌──────────┐                     ┌────────────────────────┐                    ┌──────────┐
│ Producer │ ──► [ Push Task ] ──► │     Message Queue      │ ──► [ Lease  ] ──► │ Worker A │ (Processes Task 1)
└──────────┘                     │ [Task 3][Task 2][Task 1│                    └──────────┘
                                 └────────────────────────┘                    ┌──────────┐
                                             │ ──────────────► [ Lease  ] ──► │ Worker B │ (Pulls Task 2)
                                                                               └──────────┘
```

#### How it Works:
1. A producer enqueues a discrete unit of work (e.g., `generate-pdf`, `process-payment`).
2. Multiple worker instances compete to pull or receive messages from the queue.
3. The broker leases each message to **one worker at a time**.
4. The worker finishes processing and sends an **Acknowledgment (`ACK`)**. Upon receiving the ACK, the broker deletes the message from the queue.
5. **Redelivery on Failure**: If the worker crashes, times out, or reports a negative acknowledgment (`NACK`), the broker **redelivers** the message to another worker.

> **Crucial Rule: Queues Do NOT Guarantee Exactly-Once Processing**  
> Distributed message queues operate on **at-least-once delivery**. If a worker successfully finishes a task but crashes before sending the ACK—or if a network partition drops the ACK packet—the broker assumes failure and redelivers the message. Without application-level idempotency, this results in duplicate execution.

#### Critical Queue Mechanics:
* **Acknowledgment & Redelivery (The Universal Queue Contract)**: Reading from a queue is **not an immediate destructive delete**. While in-flight, a message is reserved. Different brokers track this state differently:
  * *Visibility Timeout / Leases (Pull-based, e.g., AWS SQS, BullMQ)*: The broker hides the message from other workers for a set window (e.g., 30 seconds). If no ACK arrives before the timeout expires, the message automatically becomes visible for other workers.
  * *Channel-Bound In-Flight State (Push-based, e.g., RabbitMQ AMQP)*: The broker marks the message as `unacked` on the consumer's TCP channel. If the worker connection drops before a `basic.ack` is received, RabbitMQ immediately requeues the message at the head of the queue.
* **Throughput Buffering & Backpressure**: Queues act as shock absorbers between uneven producer and consumer speeds. If an upstream API bursts with 10,000 requests during a product launch, the queue buffers the surge. Downstream workers consume at a sustainable, rate-limited pace (e.g., 200 tasks/sec), shielding relational databases and downstream APIs from collapse.
* **Dead Letter Queues (DLQ)**: If a malformed payload crashes workers repeatedly (a *poison pill*), the broker increments a retry counter. When the count exceeds `maxReceiveCount`, the message is diverted to a DLQ so it does not block the rest of the queue.

#### Code Example: Production Task Processing with BullMQ (Redis)
```typescript
import { Queue, Worker, Job } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };

// 1. Producer: Enqueue a background export job
const exportQueue = new Queue('report-exports', { connection });

async function requestReportExport(userId: string, reportType: string) {
  await exportQueue.add(
    'generate-pdf',
    { userId, reportType, timestamp: Date.now() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      // Message is removed only after successful execution and ACK
      removeOnComplete: true,
      removeOnFail: false, // Retain failed jobs for DLQ inspection
    },
  );
}

// 2. Competing Worker: Pulls leased jobs from the queue
const worker = new Worker(
  'report-exports',
  async (job: Job) => {
    console.log(`Processing job ${job.id} for user ${job.data.userId}...`);
    await renderPdfAndUpload(job.data);
    // Returning cleanly sends an implicit ACK to the broker
    return { status: 'COMPLETED' };
  },
  { concurrency: 5, connection },
);

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error: ${err.message}`);
});
```

* **Common Tools**: **AWS SQS**, **RabbitMQ (Classic Queues)**, **BullMQ**, **Celery**.

---

### Paradigm 2: The Pub/Sub Topic (One-to-Many Fan-Out)

A **Topic** broadcasts messages according to the **Publish-Subscribe** pattern: a 1-to-many fan-out mechanism where a single published event is delivered to multiple decoupled subscribers.

```
                                 ┌─────────────────────────┐ ──► [ Copy 1 ] ──► [ Email Service ]
┌───────────┐                    │      Pub/Sub Topic      │
│ Publisher │ ──► [ Publish ] ──► │  ("user.registered")   │ ──► [ Copy 2 ] ──► [ Analytics Service ]
└───────────┘                    └─────────────────────────┘
                                              │ ────────────────► [ Copy 3 ] ──► [ Fraud Detection ]
```

#### How it Works:
1. A publisher emits an event (e.g., `user.registered`).
2. The topic duplicates the message across **every registered subscription**.
3. Each subscriber receives its own distinct copy. The `Email Service` operates with zero coupling to or awareness of the `Fraud Detection Service`.

#### Critical Pub/Sub Mechanics:
* **Pub/Sub is Not Inherently Transient**:
  A common misconception is that Pub/Sub is strictly fire-and-forget. In reality, durability and retention depend entirely on the broker and subscription model:
  * *Ephemeral Pub/Sub (e.g., Redis PUB/SUB)*: Fire-and-forget. Messages exist only in flight. If a subscriber is disconnected when a message is published, **that subscriber misses the event forever**.
  * *Durable Subscriptions (e.g., Google Cloud Pub/Sub, Azure Service Bus Topics)*: Each subscription acts as a persistent, disk-backed mailbox. Messages are stored reliably, acknowledged individually by subscribers, retained over a configurable window (e.g., 7 days), and can even be replayed via **seek** operations.
* **Subscription Filtering**: Subscribers can declare attribute filters (e.g., `country === 'US'`), allowing the broker to drop non-matching events before network transmission.

#### Code Example: Publishing an Event to an AWS SNS Topic
```typescript
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const snsClient = new SNSClient({ region: 'us-east-1' });

interface UserRegisteredEvent {
  userId: string;
  email: string;
  tier: 'FREE' | 'ENTERPRISE';
}

async function publishUserRegistered(event: UserRegisteredEvent) {
  const command = new PublishCommand({
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:user-registered-topic',
    Message: JSON.stringify(event),
    MessageAttributes: {
      userTier: {
        DataType: 'String',
        StringValue: event.tier,
      },
    },
  });

  const response = await snsClient.send(command);
  console.log(`Event broadcasted with MessageId: ${response.MessageId}`);
}
```

* **Common Tools**: **AWS SNS**, **Google Cloud Pub/Sub**, **Azure Event Grid / Service Bus Topics**, **Redis Pub/Sub** (ephemeral).

---

### Paradigm 3: The Event Stream (Append-Only Partitioned Log)

An **Event Stream** is a distributed, **partitioned, append-only commit log on disk**. Rather than tracking individual message delivery states inside the broker, the stream simply appends immutable records sequentially.

```
Partition 0 Log (Disk Storage)
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Offset 0 │ Offset 1 │ Offset 2 │ Offset 3 │ Offset 4 │ ──► (New events appended at tail)
└──────────┴──────────┴──────────┴──────────┴──────────┘
      ▲                                  ▲
      │                                  │
[ Ledger Service ]             [ Analytics Service ]
(Committed Offset: 0)          (Committed Offset: 3)
```

#### How it Works:
1. Producers write immutable records to the tail of a log partition.
2. The broker assigns each record a monotonic sequential integer: the **Offset**.
3. **Non-Destructive Reads**: Reading a record does **not** delete it. Records remain on disk according to a retention policy (e.g., 7 days, 1 year, or compact-by-key indefinitely).
4. Each consumer group independently tracks its own reading pointer (**Current Offset**). Multiple consumers read at completely different speeds without impacting broker memory or each other.

#### Critical Stream Mechanics:
* **Partition-Scoped Ordering (Not Business Chronological Order)**:
  An event stream guarantees ordering **only within a single partition**, dictated by the broker's append sequence (offset order). It does **NOT** guarantee global ordering across partitions, nor does it guarantee real-world "business time" ordering:
  - If Event A happens at `12:00:01` and Event B happens at `12:00:02`, but Event A’s producer encounters network retries or clock skew, Event B may arrive at the broker first and receive a lower offset.
  - The partition log reflects **arrival and commit order at the broker**, not real-world causality across distributed clients.
* **Replayability & Time Travel**: Because the log is retained, consumers can reset their offset to `0` and **replay historical events** to recompute state, train machine learning models, or bootstrap a new microservice.
* **Is the Stream Automatically the "Source of Truth"?**:
  Not necessarily. While pure Event Sourcing systems use the event log as the authoritative system of record, the vast majority of architectures use an event stream as an **integration backbone or Change Data Capture (CDC) pipeline** alongside a relational database (PostgreSQL, MySQL). The database remains the transactional source of truth; the stream broadcasts committed mutations to the rest of the enterprise.

#### Code Example: Appending to a Kafka Stream with Partition Keys
```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

async function recordOrderEvent(orderId: string, customerId: string, status: string) {
  await producer.connect();

  await producer.send({
    topic: 'order-events',
    messages: [
      {
        // The partition key ensures all events for THIS order land in the exact same partition,
        // guaranteeing strict append-order sequencing for that specific order.
        key: orderId,
        value: JSON.stringify({
          orderId,
          customerId,
          status,
          occurredAt: new Date().toISOString(),
        }),
      },
    ],
  });

  console.log(`Appended state transition for order ${orderId}`);
}
```

* **Common Tools**: **Apache Kafka**, **Redpanda**, **AWS Kinesis**, **Apache Pulsar**, **Redis Streams**.

---

## 3. Layer 3: How Technologies Blend These Patterns

Engineers frequently ask: *"Can Kafka be used as a queue?"* or *"Can RabbitMQ do pub/sub?"*

The answer is **yes**, because modern tools provide primitives that implement more than one architectural pattern.

### 1. How Kafka Provides Queue-Like Work Distribution via Consumer Groups
Kafka bridges Event Streams and Message Queues through **Consumer Groups**:
* **Queue-like Work Distribution**: When multiple worker instances join the **same consumer group**, Kafka's group coordinator balances partitions among them. Each partition is assigned to only one worker in the group. Workers process messages in parallel without stepping on each other, achieving competing-consumer task distribution.
* **Pub/Sub Fan-out**: When different services register under **different consumer group IDs**, each group maintains its own independent offset tracking and receives a complete copy of every record.
* **The Log Remains Retained**: Crucially, unlike a traditional queue, reading messages does not delete them. The underlying data remains immutable on disk for other consumer groups to read or replay.

```
                             ┌───────────────────────────────────┐
                             │     Kafka Topic (4 Partitions)    │
                             │   [P0]     [P1]     [P2]     [P3] │
                             └─────┬────────┬────────┬────────┬──┘
                                   │        │        │        │
                   ┌───────────────┴────────┴────────┴────────┴──────────────┐
                   │                                                         │
                   ▼                                                         ▼
    ┌──────────────────────────────┐                          ┌──────────────────────────────┐
    │ Consumer Group: "orders-app" │                          │ Consumer Group: "audit-sync" │
    │   Worker 1 ◄── [P0, P1]      │                          │   Worker A ◄── [P0, P1, P2,  │
    │   Worker 2 ◄── [P2, P3]      │                          │                 P3]          │
    │  (Behaves like a Queue)      │                          │  (Behaves like a Topic Sub)  │
    └──────────────────────────────┘                          └──────────────────────────────┘
```

> **The Partition Concurrency Ceiling**: In a traditional message queue (like SQS or RabbitMQ), you can scale up to 500 worker instances on a single queue, and each task is processed as soon as a worker is idle. In Kafka, **concurrency within a single consumer group is strictly bounded by the number of partitions**. If a topic has 8 partitions, a 9th worker instance in that consumer group will sit idle.

### 2. How RabbitMQ Implements Pub/Sub
In RabbitMQ, producers never publish directly to a queue; they publish to an **Exchange**:
* **Direct / Work Queue**: An exchange routes messages to a single bound queue.
* **Pub/Sub (Fanout Exchange)**: A fanout exchange duplicates every incoming message and delivers a copy to every bound queue, giving each downstream service its own dedicated queue.

---

## 4. Layer 4: Production Semantics & Distributed Systems Realities

### 1. Delivery Semantics (At-Most-Once, At-Least-Once, Exactly-Once)

No distributed message broker can guarantee "exactly-once delivery" across arbitrary networks without application-level coordination.

```
At-Most-Once            At-Least-Once                  "Effectively-Once"
(Fire & Forget)         (Standard Industry Default)    (At-Least-Once + Idempotent Consumer)
   │                           │                                │
   ▼                           ▼                                ▼
Lost packets = lost data.  Network blip on ACK = redelivery. Duplicate arrivals handled safely.
Low latency, zero retry.   Safe against data loss.      Safe, correct, production-grade.
```

1. **At-Most-Once**: The producer or broker fires the message and never retries. If a worker crashes or a packet drops, the message is lost forever. Acceptable only for high-volume, loss-tolerant metrics or ephemeral telemetry.
2. **At-Least-Once**: The broker ensures the message is delivered and waits for an explicit ACK. If a worker crashes mid-task, or if **the ACK is lost in flight across the network**, the message is redelivered. **Every production queue and stream operates on at-least-once semantics.**
3. **"Exactly-Once" Processing (The True Fix: Idempotency)**: Because network failures make duplicate deliveries inevitable, applications achieve "effectively-once" processing by designing **idempotent consumers**:

```typescript
async function processPaymentTask(job: { id: string; orderId: string; amount: number }) {
  // Check if job ID or order ID was already processed
  const alreadyProcessed = await db.processedJobs.findUnique({ where: { jobId: job.id } });
  if (alreadyProcessed) {
    console.warn(`Duplicate job ${job.id} detected. Acknowledging as safe no-op.`);
    return; // Safe no-op ACK
  }

  // Atomically record execution and execute side effect within a database transaction
  await db.$transaction(async (tx) => {
    await tx.processedJobs.create({ data: { jobId: job.id, processedAt: new Date() } });
    await chargeCreditCard(job.orderId, job.amount);
  });
}
```

### 2. Ordering is Scoped, Never Global
A common architectural mistake is demanding "strict global FIFO ordering across 50,000 messages per second."

Under distributed consensus and Amdahl's Law, strict global ordering requires serializing all writes through a single coordinator, creating an unscalable bottleneck.

* **In Message Queues (e.g., SQS FIFO)**: Ordering is scoped to a `MessageGroupId`. Messages with the same group ID process in sequence; messages with different group IDs process concurrently.
* **In Event Streams (e.g., Kafka / Kinesis)**: Ordering is scoped to a **Partition**. If you need events for Customer 42 to process in order, you route them to the same partition using `partitionKey = customer_42`.

### 3. Backpressure & Flow Control: Push vs. Pull
* **Push-based Models** (e.g., Webhooks, raw socket pub/sub): The broker sends messages as fast as they arrive. If upstream traffic spikes 10x, downstream consumers exhaust their memory or database connections.
* **Pull-based Models** (e.g., Kafka, SQS, BullMQ): The consumer requests only as many messages as its current compute and connection pool can handle, providing natural backpressure during surges.

---

## 5. Layer 5: The Enterprise Hybrid — The Topic-to-Queue Fan-Out Pattern

In enterprise architectures, you rarely connect raw Pub/Sub topics directly to microservice HTTP endpoints. If 50,000 users sign up during a marketing campaign, unbuffered fan-out will crash downstream services.

The production standard is the **Topic-to-Queue Fan-Out** (e.g., AWS SNS → AWS SQS, or RabbitMQ Fanout Exchange → Bound Queues):

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

### Why this pattern is standard in production:
1. **Fault Isolation**: If the Billing database is down for maintenance, messages safely accumulate in the `Billing SQS Queue` without affecting the `Email Service`.
2. **Independent Rate Limiting & Backpressure**: Email workers can burst to 50 tasks/sec, while billing workers throttle consumption to 5 tasks/sec to protect third-party payment APIs.
3. **Independent Retries & DLQs**: Each subscriber manages its own retry policies and poison-pill isolation.

---

## 6. Common Misconceptions

### 1. "Kafka is simply a faster queue."
**Reality**: Kafka is an append-only distributed commit log designed for stream processing, event sourcing, and high-throughput data pipelines. Using Kafka strictly as a simple task queue introduces severe operational overhead (managing partition rebalances, consumer lag, static concurrency limits, and topic compaction). If your workload consists of discrete, variable-duration jobs requiring per-message acknowledgments and independent retries, a dedicated message queue (SQS, RabbitMQ) is far simpler and more effective.

### 2. "Pub/Sub is necessarily ephemeral and loses data on disconnect."
**Reality**: While early protocols (Redis PUB/SUB) are fire-and-forget, modern enterprise Pub/Sub systems (Google Cloud Pub/Sub, Azure Service Bus Topics) feature **durable subscriptions**. They persist messages to disk, track acknowledgments per subscription, enforce retry policies, and support replaying messages within a retention window.

### 3. "Message Queues guarantee exactly-once processing."
**Reality**: Queues deliver messages with *at-least-once* semantics. Worker crashes, slow executions exceeding visibility timeouts, and lost network ACKs all cause redeliveries. True exactly-once processing requires application-level **idempotency**.

### 4. "Kafka guarantees global chronological ordering."
**Reality**: Kafka guarantees ordering **only within a single partition**, in the order messages are appended to the log. It does not guarantee global ordering across partitions, nor does offset order necessarily reflect real-world business-time causality if producers experience network retries or clock skew.

### 5. "An event stream is automatically your system's source of truth."
**Reality**: An event stream is an infrastructure transport mechanism. While some architectures employ Event Sourcing where the log is the system of record, the vast majority of production architectures maintain a relational database (e.g., PostgreSQL) as the authoritative source of truth, utilizing the event stream as a Change Data Capture (CDC) or event-distribution backbone.

---

## 7. Production Pitfalls & Traps

### Trap 1: The Poison Pill Infinite Loop
* **Symptom**: Queue throughput collapses, worker CPU spikes to 100%, and logs fill with identical stack traces for the same payload.
* **Underlying Cause**: A malformed message causes an unhandled exception before the consumer can ACK. The lease/visibility timeout expires, the message is redelivered to another worker, and the crash loop repeats indefinitely.
* **The Fix**: Always configure a Dead Letter Queue (DLQ) with a finite `maxReceiveCount` (typically 3 to 5). Log the unparseable payload to the DLQ and send an ACK to clear the primary queue.

### Trap 2: Partition Head-of-Line Blocking in Streams
* **Symptom**: Processing latency for an entire tenant or customer segment spikes, even though overall cluster CPU utilization is low.
* **Underlying Cause**: You routed variable-duration tasks (e.g., video transcoding jobs taking between 5 seconds and 4 hours) through sequential partition logs. Because a partition is strictly sequential, a single long-running task blocks all subsequent tasks in that partition.
* **The Fix**: Never route variable-duration, long-running tasks into sequential partition logs. Use a Message Queue with dynamic competing consumers where idle workers pull any available task.

---

## 8. Requirements-Driven Decision Framework

Rather than picking tools based on hype, evaluate your architecture against your concrete technical requirements:

```
                               ┌──────────────────────────────────────────────┐
                               │  What is the primary intent of the message?  │
                               └──────────────────────┬───────────────────────┘
                                                      │
             ┌────────────────────────────────────────┼────────────────────────────────────────┐
             ▼                                        ▼                                        ▼
  [ Work Distribution ]                    [ Broadcast Fan-Out ]                    [ Durable Log & Stream ]
  • Discrete task execution                • 1-to-many decoupled fan-out            • Replay past history
  • Per-message ACKs & leases              • Ephemeral or durable subscriptions     • Independent consumer offsets
  • Dynamic worker concurrency             • Topic-based filtering                  • Strict ordering within key
  • Variable processing times              • Downstream queue buffering             • Stream processing & CDC
             │                                        │                                        │
             ▼                                        ▼                                        ▼
    MESSAGE QUEUE PATTERN                   PUB/SUB TOPIC PATTERN                     EVENT STREAM PATTERN
    (AWS SQS, RabbitMQ, BullMQ)          (AWS SNS, Google Cloud Pub/Sub)              (Apache Kafka, Redpanda)
```

### The Architectural Checklist:

1. **Do you need work distribution across dynamic worker pools with per-message ACKs and independent retries?**
   * **Choose a Message Queue** (SQS, RabbitMQ, BullMQ).
2. **Do multiple independent services need to react to the same domain event without the publisher knowing who they are?**
   * **Choose a Pub/Sub Topic** (AWS SNS, Google Cloud Pub/Sub). Combine with downstream queues (SNS → SQS) if workers need buffering and backpressure.
3. **Do you need to rewind and replay history, maintain ordered state changes, or build multiple real-time materialized views?**
   * **Choose an Event Stream** (Kafka, Redpanda, Kinesis).
4. **Is your workload composed of variable-duration, long-running jobs (seconds to hours)?**
   * **Avoid Event Streams.** Use a Message Queue with visibility timeouts to prevent head-of-line blocking.
5. **Is strict global FIFO ordering required across the entire system?**
   * **Re-evaluate your architecture.** Strive for *scoped ordering* (by customer ID or tenant ID) so you can partition horizontally without hitting serialization bottlenecks.
6. **Are duplicate messages catastrophic to your business logic?**
   * **Do not rely on the transport layer alone.** Implement idempotent consumers backed by unique database constraints or distributed idempotency keys regardless of the broker chosen.
