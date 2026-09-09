---
title: "Message Queues, Topics, and Event Streams Explained: How They Differ and When to Use Each"
slug: "message-queues-topics-event-streams-explained"
description: "Point-to-point queues, publish-subscribe topics, and append-only event streams demystified: consumer semantics, retention mechanics, real-world failure modes, and code examples."
publishDate: "2026-08-25T10:00:00Z"
updatedDate: "2026-09-09T22:30:00Z"
updateSummary: "Restructured with layered architecture: separated patterns from technologies, added production delivery semantics (idempotency, DLQs, scoped ordering), debunked common misconceptions, and refined the requirements-driven decision framework."
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

A **Queue** is an abstract pattern for point-to-point task execution. An **Event Stream** is an abstract pattern for an append-only commit log. A single tool (such as RabbitMQ or Kafka) can often implement or emulate multiple patterns depending on how you configure its consumers.

Here is the first-principles breakdown of the three core paradigms, their mechanics, delivery semantics, real-world failure modes, and a requirements-driven decision framework.

---

## 1. Layer 1: The Three Core Mental Models

To choose the right tool, you first need clear mental models of what each paradigm is designed to accomplish.

```
1. Message Queue:  "Here is a job. Exactly one worker in the pool must complete it."
2. Pub/Sub Topic:  "Something just happened. Broadcast it to any service that cares."
3. Event Stream:   "Here is an immutable timeline of events. Read at your own pace and replay if needed."
```

| Dimension | Message Queue | Pub/Sub Topic | Event Stream |
| :--- | :--- | :--- | :--- |
| **Core Purpose** | **Work distribution** (competing consumers) | **Broadcast fan-out** (1-to-many announcements) | **Durable history & stream processing** |
| **Message Nature** | Imperative command or discrete task | Ephemeral or semi-durable notification | Immutable state change / fact |
| **Consumer Topology** | Competing consumers (load-balanced) | Independent isolated subscribers | Independent consumer groups reading an offset |
| **Read Lifecycle** | Acknowledged removal (leased -> deleted) | Delivered to active/durable subscriptions | Non-destructive read (offset advancement) |
| **Storage Horizon** | Ephemeral (cleared as work is completed) | Transient to short-lived | Configurable retention (days, years, or infinite) |

---

## 2. Layer 2: Core Mechanics & Storage Under the Hood

### Paradigm 1: The Message Queue (Point-to-Point Work Distribution)

A **Message Queue** coordinates asynchronous task execution among a pool of **competing consumers**. The primary goal is to ensure work is distributed across available compute resources.

```
┌──────────┐                     ┌────────────────────────┐                    ┌──────────┐
│ Producer │ ──► [ Push Task ] ──► │     Message Queue      │ ──► [ Lease  ] ──► │ Worker A │ (Processes Task 1)
└──────────┘                     │ [Task 3][Task 2][Task 1│                    └──────────┘
                                 └────────────────────────┘                    ┌──────────┐
                                             │ ──────────────► [ Lease  ] ──► │ Worker B │ (Pulls Task 2)
                                                                               └──────────┘
```

#### How it Works:
1. A producer enqueues a discrete unit of work (e.g., `generate-pdf`, `resize-avatar`).
2. Multiple worker instances subscribe or poll the same queue.
3. The broker leases each message to **one worker at a time**.
4. Once the worker finishes processing and issues an **Acknowledgment (`ACK`)**, the broker removes the message from the queue.

#### Critical Queue Mechanics:
* **Visibility Timeout / Unacked Leases**: Reading from a queue is **not immediately destructive**. When Worker A pulls `Task 1`, the broker places it into an in-flight invisible state. If Worker A crashes, times out, or sends a negative acknowledgment (`NACK`), the lease expires. `Task 1` becomes visible again, allowing Worker B to process it.
* **Dead Letter Queues (DLQ)**: If a message repeatedly crashes workers (a *poison pill*), the broker increments a retry counter. When the count exceeds `maxReceiveCount`, the message is diverted to a DLQ so it does not block the queue indefinitely.

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
      removeOnFail: false, // Retain failed jobs for inspection / DLQ analysis
    },
  );
}

// 2. Competing Worker: Pulls leased jobs from the queue
const worker = new Worker(
  'report-exports',
  async (job: Job) => {
    console.log(`Processing job ${job.id} for user ${job.data.userId}...`);
    // Perform heavy CPU work
    await renderPdfAndUpload(job.data);
    // Returning cleanly signals an implicit ACK to the broker
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

A **Topic** broadcasts messages according to the **Publish-Subscribe** pattern. The publisher does not know or care who is listening; its responsibility ends once the event is accepted by the topic.

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
3. Each subscriber receives its own distinct copy. The `Email Service` sending a verification email operates completely independently of the `Fraud Detection Service`.

#### Critical Pub/Sub Mechanics:
* **Ephemeral vs. Durable Subscriptions**: 
  * *Ephemeral Pub/Sub* (e.g., Redis `PUBLISH`/`SUBSCRIBE`): If a subscriber disconnects for 500 milliseconds, any message published during that window is **lost forever** for that subscriber.
  * *Durable Pub/Sub* (e.g., Google Cloud Pub/Sub, Azure Service Bus Topics, AWS SNS connected to SQS): Each subscription maintains its own persistent message backlog. If the subscriber goes offline, messages accumulate in its subscription queue until the subscriber recovers.
* **Subscription Filtering**: Many topic systems allow subscribers to declare attribute filters (e.g., `attributes.country == 'US'`), avoiding network overhead for irrelevant events.

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

### Paradigm 3: The Event Stream (Append-Only Log)

An **Event Stream** is a distributed, **partitioned, append-only log on disk**. Rather than tracking per-message delivery state inside the broker, the stream simply appends records in strict sequence.

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
2. The broker assigns each record a monotonic, sequential integer: the **Offset**.
3. **Non-Destructive Reads**: Reading a record does **not** delete it. The data remains on disk according to a retention policy (e.g., 7 days, 1 year, or compact-by-key indefinitely).
4. Each consumer group independently tracks its own position (**Current Offset**). Consumers can read at different speeds without impacting each other or broker memory.

#### Critical Stream Mechanics:
* **Replayability & Temporal Decoupling**: If you deploy a new recommendation algorithm today, you do not start with a cold cache. You can create a new consumer group, initialize its offset to `0`, and **replay months of raw event history** to train its local projection.
* **Scoped Ordering**: An event stream does **not** guarantee total ordering across the entire cluster. It guarantees strict ordering **only within a single partition**. Messages with the same partition key always land in the same partition and are consumed in the exact sequence they were written.

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
        // guaranteeing strict chronological ordering for that specific order.
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

Engineers often ask: *"Can Kafka be used as a queue?"* or *"Can RabbitMQ do pub/sub?"*

The answer is **yes**, because modern tools provide primitives that implement more than one architectural pattern.

### 1. How Kafka Behaves Like a Queue via Consumer Groups
Kafka achieves both Pub/Sub and Queue semantics using **Consumer Groups**:
* **Queue Behavior**: If multiple worker instances join the **same consumer group**, Kafka distributes the partitions among them. Each partition is consumed by only one worker in the group, achieving **competing-consumer work distribution**.
* **Pub/Sub Behavior**: If different services register under **different consumer group IDs**, each group receives a complete copy of every record written to the topic.

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

> **The Partition Bottleneck Trade-off**: In a traditional message queue (like SQS or RabbitMQ), you can scale up to 500 worker instances for a single queue, and each message is independently processed. In Kafka, **concurrency within a consumer group is bounded by the number of partitions**. If a topic has 8 partitions, a 9th worker instance in that consumer group will sit idle.

### 2. How RabbitMQ Implements Pub/Sub
In RabbitMQ, producers never publish directly to a queue. They publish to an **Exchange**:
* **Direct / Work Queue**: An exchange routes messages to a single bound queue.
* **Pub/Sub (Fanout)**: A fanout exchange clones every message and routes it to multiple bound queues, each dedicated to a distinct downstream service.

---

## 4. Layer 4: Production Semantics & Distributed Systems Realities

When taking messaging systems to production, theoretical diagrams meet distributed networking realities.

### 1. The Delivery Guarantee Spectrum
No distributed message broker provides pure "exactly-once delivery" across arbitrary networks without application-level coordination.

```
At-Most-Once            At-Least-Once                  "Effectively-Once"
(Fire & Forget)         (Standard Industry Default)    (At-Least-Once + Idempotent Consumer)
   │                           │                                │
   ▼                           ▼                                ▼
Lost packets = lost data.  Network blip on ACK = redelivery. Duplicate arrivals handled safely.
Low latency, zero retry.   Safe against data loss.      Safe, correct, production-grade.
```

1. **At-Most-Once**: The broker sends the message and does not wait for confirmation. If the worker crashes mid-execution, the message is permanently lost. Used for non-critical telemetry and loss-tolerant metrics.
2. **At-Least-Once**: The broker expects an explicit ACK. If the consumer crashes, or if **the ACK is lost in flight across the network**, the broker redelivers the message. **Every production queue and stream operates on at-least-once semantics.**
3. **Idempotency (The True Fix)**: Because duplicates are inevitable in distributed systems, consumers must be idempotent. A consumer checks an idempotency key (or database unique constraint) before executing side effects:

```typescript
async function processPaymentTask(job: { id: string; orderId: string; amount: number }) {
  // Use a database transaction with a unique constraint on orderId / idempotency key
  const alreadyProcessed = await db.processedJobs.findUnique({ where: { jobId: job.id } });
  if (alreadyProcessed) {
    console.warn(`Duplicate job ${job.id} ignored.`);
    return; // Safe no-op ACK
  }

  await db.$transaction(async (tx) => {
    await tx.processedJobs.create({ data: { jobId: job.id, processedAt: new Date() } });
    await chargeCreditCard(job.orderId, job.amount);
  });
}
```

### 2. Ordering is Scoped, Never Global
A common architectural trap is demanding "strict global FIFO ordering across 50,000 messages per second."

Under the laws of physics and distributed consensus (Amdahl's Law), strict global ordering requires serializing all writes through a single master coordinator, destroying horizontal scalability.

* **In Message Queues (e.g., SQS FIFO)**: Ordering is scoped to a `MessageGroupId`. Messages within the same group are processed in order; messages across different groups run concurrently.
* **In Event Streams (e.g., Kafka / Kinesis)**: Ordering is scoped to a **Partition**. If you need orders for Customer 42 to process in chronological sequence, you set `partitionKey = customer_42`.

### 3. Backpressure: Push vs. Pull
* **Push-based Models** (e.g., classic Webhooks, raw socket pub/sub): The broker sends messages as fast as they arrive. If traffic spikes 10x, downstream services run out of memory or exhaust their database connection pools.
* **Pull-based Models** (e.g., Kafka, SQS, BullMQ): The consumer requests only as many messages as its current thread/connection pool can process. Backpressure is naturally preserved during traffic spikes.

---

## 5. Layer 5: The Enterprise Hybrid — The Topic-to-Queue Fan-Out Pattern

In enterprise architectures, you rarely use raw Pub/Sub topics to talk directly to microservice HTTP endpoints. If 20,000 users sign up during a product launch, an unbuffered fan-out topic will overwhelm downstream services.

The battle-tested solution is the **Topic-to-Queue Fan-Out** (e.g., AWS SNS → AWS SQS, or RabbitMQ Fanout Exchange → Dedicated Queues):

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
1. **Fault Isolation**: If the Billing database goes down for maintenance, the `Billing SQS Queue` safely buffers messages for hours. The `Email Service` continues processing without delay.
2. **Independent Rate Limiting & Backpressure**: Email workers can burst to 50 operations per second, while billing workers throttle ingestion to 5 operations per second to protect third-party payment gateways.
3. **Independent Retries & DLQs**: Each subscriber configures its own retry policy and poison-pill isolation.

---

## 6. Common Misconceptions

### Misconception 1: "Kafka is just a faster, modern replacement for RabbitMQ or SQS."
**Reality**: Kafka is an append-only distributed log designed for stream processing and event sourcing. Using Kafka strictly as a task queue introduces unnecessary operational overhead (managing partition rebalances, consumer lag, static concurrency limits, and topic compaction). If your workload consists of discrete, long-running jobs that need per-message acknowledgments and arbitrary retries, a dedicated message queue is a far cleaner fit.

### Misconception 2: "Queues guarantee that each message is processed only once."
**Reality**: Queues deliver messages with *at-least-once* semantics. If a worker finishes processing but encounters a network timeout while sending the ACK, the visibility timeout expires and another worker receives the same message. Exactly-once processing is achieved only through **idempotent consumers**.

### Misconception 3: "Pub/Sub always loses messages if a subscriber disconnects."
**Reality**: Only *ephemeral* Pub/Sub (like Redis PUB/SUB) drops messages on disconnection. Enterprise Pub/Sub services (like Google Cloud Pub/Sub or Azure Service Bus Topics) use *durable subscriptions* that maintain independent disk-backed queues for every subscriber.

### Misconception 4: "An event stream is automatically your system's source of truth."
**Reality**: An event stream is an infrastructure transport mechanism. While some teams use event streams for Event Sourcing (where the log is the state), in the vast majority of architectures, a relational database (e.g., PostgreSQL) remains the authoritative source of truth. The stream is populated via Change Data Capture (CDC / Debezium) to broadcast updates downstream.

---

## 7. Production Pitfalls & Traps

### Trap 1: The Poison Pill Infinite Loop
* **Symptom**: Queue throughput drops to near zero, worker CPU spikes to 100%, and error logs fill with repeated stack traces for the same payload.
* **Underlying Cause**: A malformed message causes an unhandled exception or crash before the consumer can ACK. The visibility timeout expires, the message is re-leased to another worker, and the cycle repeats indefinitely.
* **The Fix**: Always configure a Dead Letter Queue (DLQ) with a finite `maxReceiveCount` (typically 3 to 5). Log the unparseable payload to the DLQ and send an ACK for the primary queue.

### Trap 2: Partition Head-of-Line Blocking in Streams
* **Symptom**: Processing latency for an entire customer segment spikes, even though overall cluster CPU utilization is low.
* **Underlying Cause**: You routed variable-duration tasks (e.g., processing video files ranging from 2 seconds to 4 hours) through Kafka partitions. Because a partition is strictly sequential, a single long-running task blocks all subsequent tasks in that partition.
* **The Fix**: Never route variable-duration, long-running tasks into sequential partition logs. Use a Message Queue with dynamic competing consumers (like SQS or BullMQ) where idle workers can pick up any ready task.

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
  [ Discrete Work Execution ]              [ Real-Time Broadcast ]                  [ Timeline & State Stream ]
  • Individual task ACKs                   • One-to-many fan-out                    • Replay past history
  • Dynamic worker scaling                 • Decoupled notifications                • Independent consumer offsets
  • Variable processing times              • Ephemeral or durable delivery          • Strict ordering within key
             │                                        │                                        │
             ▼                                        ▼                                        ▼
    MESSAGE QUEUE PATTERN                   PUB/SUB TOPIC PATTERN                     EVENT STREAM PATTERN
    (AWS SQS, RabbitMQ, BullMQ)          (AWS SNS, Google Cloud Pub/Sub)              (Apache Kafka, Redpanda)
```

### The Architectural Checklist:

1. **Do you need per-message acknowledgments, dynamic worker pools, and independent retries?**
   * **Choose a Message Queue** (SQS, RabbitMQ, BullMQ).
2. **Do multiple independent services need to react to the same event without the publisher knowing who they are?**
   * **Choose a Pub/Sub Topic** (AWS SNS, Google Cloud Pub/Sub). Combine with downstream queues (SNS → SQS) if workers need buffering and backpressure.
3. **Do you need to rewind and replay history, maintain ordered state changes, or build multiple real-time materialized views?**
   * **Choose an Event Stream** (Kafka, Redpanda, Kinesis).
4. **Is your workload composed of variable-duration, long-running jobs (seconds to hours)?**
   * **Avoid Event Streams.** Use a Message Queue with visibility timeouts to prevent head-of-line blocking.
5. **Is strict global FIFO ordering required across the entire system?**
   * **Re-evaluate your architecture.** Strive for *scoped ordering* (by customer ID or tenant ID) so you can partition horizontally without hitting serialization bottlenecks.
