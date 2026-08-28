---
title: "Message Queues, Topics, and Event Streams Explained: How They Differ and When to Use Each"
slug: "message-queues-topics-event-streams-explained"
description: "Point-to-point queues, publish-subscribe topics, and append-only event streams demystified: consumer semantics, retention mechanics, real-world failure modes, and code examples."
publishDate: "2026-08-25T10:00:00Z"
author: "Prayash Mishra"
tags: ["architecture", "backend", "microservices", "kafka", "rabbitmq", "aws"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Comparison architecture diagram showing Message Queues, Pub/Sub Topics, and Event Streams"
draft: false
---

In distributed systems engineering, few terms are as overloaded and conflated as **messaging**. 

Developers frequently use the words **Queue**, **Topic**, **Pub/Sub**, and **Stream** interchangeably. But treating them as the same thing leads to expensive architectural blunders:
* Deploying a heavyweight Apache Kafka cluster just to send background welcome emails.
* Using Redis Pub/Sub for financial billing transactions, only to drop payments during a 2-second network blip.
* Routing variable-duration video encoding jobs through Kafka partitions, creating catastrophic head-of-line blocking.

Under the hood, these systems operate on fundamentally different **storage models**, **delivery semantics**, and **consumption lifecycles**.

Here is the first-principles breakdown of the three core messaging paradigms, their internal mechanics, real-world production scenarios, and code examples.

---

## 1. Paradigm 1: The Message Queue (Point-to-Point)

A **Message Queue** is built for **work distribution**. It operates on the **Point-to-Point** and **Competing Consumers** pattern.

```
┌──────────┐                     ┌────────────────────────┐                    ┌──────────┐
│ Producer │ ──► [ Push Task ] ──► │     Message Queue      │ ──► [ Assign ] ──► │ Worker A │ (Processes Task)
└──────────┘                     │ [Task 3][Task 2][Task 1│                    └──────────┘
                                 └────────────────────────┘                    ┌──────────┐
                                             │ ──────────────► [ Assign ] ──► │ Worker B │ (Idle)
                                                                               └──────────┘
```

### How it Works:
1. A producer enqueues a message.
2. Multiple worker processes listen to the same queue.
3. **Exactly ONE worker receives and processes each message** (load balanced across workers).
4. Once the worker finishes and sends an Acknowledgment (`ACK`), the message is **permanently deleted from the queue** (**Destructive Read**).

### Key Mechanics:
* **Visibility Timeout**: When Worker A pulls `Task 1`, the queue hides `Task 1` from other workers for a set window (e.g., 30 seconds). If Worker A crashes without sending an ACK, the timeout expires, and `Task 1` reappears in the queue for Worker B to retry.
* **Dead Letter Queue (DLQ)**: If a message fails repeatedly (exceeding `maxReceiveCount`), the broker moves it to a DLQ so it doesn't block the rest of the queue (**Poison Pill Isolation**).

### Real-World Scenario: Asynchronous PDF Generation & Video Encoding
When a user requests a 500-page accounting report export, the web request should not hang. The API pushes an export job to a queue. Ten background workers compete to process jobs as CPU capacity allows. Once exported, the job is gone.

### Code Example: Production Task Queue with BullMQ (Redis)
```typescript
// Producer: Enqueue a background report generation job
import { Queue, Worker, Job } from 'bullmq';

const exportQueue = new Queue('report-exports', {
  connection: { host: 'localhost', port: 6379 },
});

async function requestReportExport(userId: string, reportType: string) {
  // Job ID deduplication prevents accidental duplicate submissions
  await exportQueue.add(
    'generate-pdf',
    { userId, reportType, timestamp: Date.now() },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true, // Destructive read: delete when done
    },
  );
}

// Consumer: Competing worker pulling jobs
const worker = new Worker(
  'report-exports',
  async (job: Job) => {
    console.log(`Processing job ${job.id} for user ${job.data.userId}...`);
    // Heavy CPU task: Render PDF, upload to S3
    await generatePdfFile(job.data);
    return { status: 'COMPLETED' };
  },
  { concurrency: 5, connection: { host: 'localhost', port: 6379 } },
);
```

* **Best-fit Tools**: **AWS SQS**, **RabbitMQ (Classic Queues)**, **BullMQ**, **Celery**.

---

## 2. Paradigm 2: The Pub/Sub Topic (One-to-Many Fan-Out)

A **Topic** is built for **broadcasting announcements**. It operates on the **Publish-Subscribe (Pub/Sub)** pattern.

```
                                 ┌─────────────────────────┐ ──► [ Copy 1 ] ──► [ Email Service ]
┌───────────┐                    │      Pub/Sub Topic      │
│ Publisher │ ──► [ Publish ] ──► │  ("user.registered")   │ ──► [ Copy 2 ] ──► [ Analytics Service ]
└───────────┘                    └─────────────────────────┘
                                              │ ────────────────► [ Copy 3 ] ──► [ Fraud Detection ]
```

### How it Works:
1. A publisher emits an event to a named topic (e.g., `user.registered`).
2. The topic duplicates the message and **fans it out to EVERY registered subscriber**.
3. Subscribers operate completely independently: the `Email Service` sending a welcome email has no awareness of the `Analytics Service` recording metrics.

### Key Mechanics:
* **Ephemeral Delivery**: Pure pub/sub systems do not retain history. If a subscriber is offline or disconnected when the message is published, **the subscriber misses the event forever** (unless backed by a persistent subscription queue).
* **Topic Filtering / Subscriptions**: Subscribers can specify filter policies (e.g., subscribe to `orders` only where `attributes.country === 'US'`).

### Real-World Scenario: User Registration Event Fan-Out
When a new customer signs up, multiple downstream systems must react immediately:
1. Auth Service creates user.
2. Auth Service publishes `UserRegistered` to the topic.
3. Notification Service sends an SMS verification code.
4. Data Warehouse records sign-up attribution.
5. CRM Service creates a Salesforce lead.

### Code Example: Publishing an Event to an AWS SNS Topic
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
    // MessageAttributes allow subscribers to filter messages without parsing body
    MessageAttributes: {
      userTier: {
        DataType: 'String',
        StringValue: event.tier,
      },
    },
  });

  const response = await snsClient.send(command);
  console.log(`Event broadcasted to all subscribers. MessageId: ${response.MessageId}`);
}
```

* **Best-fit Tools**: **AWS SNS**, **Google Cloud Pub/Sub**, **Redis Pub/Sub**, **Azure Event Grid**.

---

## 3. Paradigm 3: The Event Stream / Append-Only Log

An **Event Stream** is not just a messaging channel—it is a **durable, ordered, append-only commit log on disk**.

```
Partition 0 Log (Disk)
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Offset 0 │ Offset 1 │ Offset 2 │ Offset 3 │ Offset 4 │ ──► (New incoming events appended)
└──────────┴──────────┴──────────┴──────────┴──────────┘
      ▲                      ▲
      │                      │
[ Payment Service ]     [ Inventory Service ]
(Current Offset: 0)     (Current Offset: 2)
```

### How it Works:
1. Producers append immutable event records to the end of a partitioned log.
2. Messages are assigned a strictly sequential, monotonic number called an **Offset**.
3. **Non-Destructive Read**: Reading an event does **NOT** delete it. The broker keeps the event on disk according to a retention policy (e.g., retain for 7 days, 1 year, or forever).
4. Each consumer service tracks its own pointer (**Current Offset**). Multiple consumer groups can read the same stream at completely different speeds.

### Key Mechanics:
* **Replayability & Time Travel**: If you deploy a new machine learning recommendation service today, you don't start with empty data. You can set the consumer offset back to `Offset 0` and **replay the entire last 12 months of events** to build its internal database!
* **Strict Ordering via Partition Keys**: While a queue does not guarantee total ordering across parallel workers, an Event Stream guarantees **strict sequential ordering per partition key** (e.g., all events with `partitionKey: orderId` go to the same partition and are processed in exact chronological order).

### Real-World Scenario: Financial Ledgers & Event-Driven Microservices
In banking, every state transition (Account Created → Deposit Submitted → Compliance Verified → Funds Credited) is recorded in an immutable ledger stream. Even if a downstream accounting service crashes for 4 hours, it wakes up, reads from its last committed offset, and catches up with zero data loss.

### Code Example: Kafka Producer with Partition Keys
```typescript
import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'billing-app',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

async function recordTransaction(accountId: string, amount: number, type: 'DEBIT' | 'CREDIT') {
  await producer.connect();

  await producer.send({
    topic: 'bank-transactions',
    messages: [
      {
        // Partition Key guarantees all transactions for THIS account go to the same
        // partition, preserving strict chronological ordering!
        key: accountId,
        value: JSON.stringify({
          accountId,
          amount,
          type,
          timestamp: Date.now(),
        }),
      },
    ],
  });

  console.log(`Transaction appended to immutable event stream for account ${accountId}`);
}
```

* **Best-fit Tools**: **Apache Kafka**, **AWS Kinesis**, **Redpanda**, **Apache Pulsar**, **Redis Streams**.

---

## 4. Architectural Comparison: The Complete Cheat Sheet

| Feature | Message Queue (Point-to-Point) | Pub/Sub Topic (Fan-Out) | Event Stream (Append-Only Log) |
| :--- | :--- | :--- | :--- |
| **Underlying Model** | Ephemeral holding buffer | Transient broadcast bus | Distributed append-only log on disk |
| **Consumption Semantics** | Competing consumers (1 worker per msg) | Fan-out (every subscriber gets a copy) | Consumer groups reading sequential offsets |
| **Message Read Lifecycle** | **Destructive**: Deleted upon `ACK` | **Transient**: Discarded once pushed | **Non-destructive**: Retained on disk |
| **Historical Replay** | ❌ Impossible | ❌ Impossible | ✅ **Supported (rewind offset to any point)** |
| **Ordering Guarantee** | Best-effort (or slow strict FIFO queues) | None | **Strict FIFO within each partition key** |
| **Slow Consumer Impact** | Backlog builds up in queue | May drop messages or disconnect | Safe: consumer lags behind without hurting others |
| **Primary Goal** | **Asynchronous Task Processing** | **Real-Time Notification Broadcast** | **State Synchronization & Event Mesh** |

---

## 5. The Golden Hybrid: The Topic-to-Queue Fan-Out Pattern

In production enterprise architecture, you rarely use Pub/Sub topics in isolation. 

**The Pitfall of Pure Topics**: If an SNS topic invokes microservices directly via HTTP webhooks, a sudden spike of 50,000 signups will flood and crash your downstream web servers. Furthermore, if an HTTP endpoint is down, the message is lost.

**The Solution: SNS → SQS Fan-Out**:
You publish to a central Topic, but each subscriber subscribes **its own dedicated Message Queue** to that topic:

```
                            ┌───────────────────────────────────┐
                            │    AWS SNS Topic (user.created)   │
                            └─────────────────┬─────────────────┘
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │    Email Worker Queue   │                       │   Billing Worker Queue  │
        │        (AWS SQS)        │                       │        (AWS SQS)        │
        └────────────┬────────────┘                       └────────────┬────────────┘
                     │                                                 │
                     ▼                                                 ▼
        [ Email Worker Pool ]                             [ Billing Worker Pool ]
        (Pulls at controlled rate: 50/sec)                (Pulls at controlled rate: 10/sec)
```

### Why this pattern is elite:
1. **Zero Message Loss**: If the billing service is being redeployed, messages safely accumulate in the `Billing SQS Queue` without affecting the `Email Queue`.
2. **Built-in Backpressure / Rate Limiting**: Each worker pool consumes tasks at its own maximum comfortable processing rate without overwhelming downstream databases.

---

## 6. Decision Tree: Which One Should You Choose?

```
                       ┌──────────────────────────────────────────────┐
                       │  What is the primary intent of the message?  │
                       └──────────────────────┬───────────────────────┘
                                              │
          ┌───────────────────────────────────┼───────────────────────────────────┐
          ▼                                   ▼                                   ▼
[ Execute an Async Job ]             [ Broadcast an Event ]              [ Audit Log & Event Mesh ]
  • "Send an email"                    • "Order #123 was created"          • "Order lifecycle state history"
  • "Resize this image"                • "User updated their email"        • "Financial balance ledger"
  • "Export analytics CSV"             • "Cache invalidation ping"         • "Replaying events for ML models"
          │                                   │                                   │
          ▼                                   ▼                                   ▼
  USE A MESSAGE QUEUE                 USE A PUB/SUB TOPIC                 USE AN EVENT STREAM
 (RabbitMQ, SQS, BullMQ)            (AWS SNS, Google Pub/Sub)            (Apache Kafka, Redpanda)
```

### Quick Rule of Thumb:
* If you care about **getting work done by a pool of workers**, pick a **Message Queue**.
* If you care about **notifying many decoupled services that something just happened**, pick a **Topic**.
* If you care about **ordering, replaying past history, and treating events as the source of truth**, pick an **Event Stream**.
