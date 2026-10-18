---
title: "NestJS and Dapr: State, Secrets, Configuration and Pub/Sub"
headline: "Dapr state, secrets, config and pub/sub"
slug: "nestjs-dapr-state-secrets-config-pubsub"
description: "Dapr state with ETag concurrency (and why the Node SDK loses the ETag), secrets, live configuration and pub/sub, from NestJS."
publishDate: "2026-08-14T10:00:00Z"
author: "Prayash Mishra"
pillar: "running-services"
cover: "dapr-state"
tags: ["nestjs", "dapr", "microservices", "kafka"]
series: "nestjs-dapr"
seriesPart: 3
related: ["transactional-outbox-pattern-production-realities", "idempotency-in-distributed-systems"]
draft: false
---

In **[Part 2](/blog/nestjs-dapr-nestjs-integration-service-invocation)**, we built a reusable `DaprModule` and implemented synchronous service-to-service RPC with Dapr Service Invocation.

While synchronous RPC is necessary for immediate queries, production cloud-native backends rely heavily on **state persistence, decoupled secrets, dynamic configurations, and asynchronous pub/sub messaging**.

In this guide, we implement full production-grade code for four core Dapr building blocks inside NestJS.

---

## 1. State Store: Key-Value Storage with ETag Concurrency

Dapr abstracts state storage across Redis, AWS DynamoDB, Azure CosmosDB, and PostgreSQL. Instead of importing specialized database drivers into our NestJS service, we interact with a unified key-value API.

```
NestJS Application
        │
        ├── daprClient.state.save('statestore', [{ key, value, etag }])
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ Dapr Sidecar                                           │
│  └── Optimistic Concurrency Control (ETag Verification)│
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
             ┌───────────────────────┐
             │ Pluggable State Store │
             │ (Redis / DynamoDB)    │
             └───────────────────────┘
```

### 1.1 Optimistic Concurrency Control (ETags)
When multiple microservice replicas update the same entity concurrently, standard writes suffer from **race conditions** ("last write wins"). Dapr provides **ETag-based optimistic concurrency control**: writes only succeed if the ETag matches the current version.

Dapr returns the ETag in the `ETag` **HTTP response header** of the state-get call, and the value is opaque — its format is defined by the backing store (Redis, Cosmos DB, Postgres), so never parse it, only round-trip it.

### 1.2 The trap: the Node SDK does not surface the ETag

This is the part that bites people. The obvious implementation is wrong:

```typescript
// ❌ BROKEN — and silently so.
const response = await this.daprClient.state.get(this.storeName, key);
return { data: response as OrderState, etag: (response as any).etag };
```

`daprClient.state.get()` resolves to the **deserialized value only**. There is no `etag` property on it, so `(response as any).etag` is always `undefined`, `etag` is always `undefined`, and `concurrency: etag ? 'first-write' : 'last-write'` therefore **always** evaluates to `'last-write'`.

The optimistic-locking code path is never reached. There is no error, no warning, no failed test — you have written last-write-wins and labelled it `first-write`. Every `ConflictException` in this class is unreachable.

To get the ETag you have to read the response header off the sidecar's HTTP API yourself.

### 1.3 Corrected State Repository Implementation
```typescript
// apps/order-service/src/order-state.repository.ts
import { Inject, Injectable, Logger, ConflictException } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT, DAPR_HTTP_URL, DAPR_API_TOKEN } from './dapr/dapr.module';

export interface OrderState {
  orderId: string;
  customerId: string;
  items: Array<{ sku: string; quantity: number }>;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
  total: number;
}

export interface StoredOrder {
  data: OrderState;
  /** Opaque, store-defined. Round-trip it; never parse it. */
  etag?: string;
}

@Injectable()
export class OrderStateRepository {
  private readonly storeName = 'order-statestore'; // Matches Dapr component name
  private readonly logger = new Logger(OrderStateRepository.name);

  constructor(
    @Inject(DAPR_CLIENT) private readonly daprClient: DaprClient,
    @Inject(DAPR_HTTP_URL) private readonly httpUrl: string,
    @Inject(DAPR_API_TOKEN) private readonly apiToken: string,
  ) {}

  /**
   * Reads the order *and* its ETag.
   *
   * Uses the sidecar HTTP API rather than `daprClient.state.get()` because the
   * SDK discards the `ETag` response header, which is the only place the ETag
   * is exposed. Verified against Dapr's state API; the header name has been
   * stable since v1.0, but re-check it if you pin a very old runtime.
   */
  async getOrder(orderId: string): Promise<StoredOrder | null> {
    const key = `order_${orderId}`;
    const res = await fetch(
      `${this.httpUrl}/v1.0/state/${this.storeName}/${encodeURIComponent(key)}`,
      { headers: { 'dapr-api-token': this.apiToken } },
    );

    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`State read failed for ${key}: ${res.status} ${await res.text()}`);
    }

    // No state stored under this key means an empty body, not a 404.
    const raw = await res.text();
    if (!raw) {
      return null;
    }

    return {
      data: JSON.parse(raw) as OrderState,
      etag: res.headers.get('etag') ?? undefined,
    };
  }

  async saveOrder(order: OrderState, etag?: string): Promise<void> {
    try {
      await this.daprClient.state.save(this.storeName, [
        {
          key: `order_${order.orderId}`,
          value: order,
          // Omitting `etag` is what selects last-write-wins. If you got here
          // without one, say so loudly rather than silently degrading.
          etag,
          options: {
            concurrency: etag ? 'first-write' : 'last-write',
            consistency: 'strong',
          },
        },
      ]);
      this.logger.log(`Order ${order.orderId} persisted to state store.`);
    } catch (error) {
      this.logger.error(`Concurrency conflict on order ${order.orderId}:`, error);
      throw new ConflictException('Order was updated by another process. Please retry with latest state.');
    }
  }
}
```

### 🔍 Deep Dive: State Mechanics
* **`etag` is a header, not a field.** `GET /v1.0/state/{store}/{key}` returns the value as the body and the version in the `ETag` response header. There is no `{ data, etag }` envelope.
* **`concurrency: 'first-write'`** asks the state store to reject the write unless the supplied ETag still matches its current version. Redis does this with a Lua script; DynamoDB with a conditional expression. On mismatch Dapr returns **HTTP 409**, which the `catch` above converts into a NestJS `ConflictException`.
* **Failure mode to test for:** if your store component has `keyPrefix` or a custom query configured, the version Dapr tracks may not line up with the version you read. A 409 that fires on *every* save is almost always this, not contention.

### ⚠️ Verify this in a test, not by inspection

A concurrency bug that silently disables itself will never fail a unit test with a single mock. Assert on the wire:

```typescript
it('rejects a write built on a stale ETag', async () => {
  const first = await repo.getOrder('o-1');
  await repo.saveOrder({ ...first!.data, status: 'CONFIRMED' }, first!.etag);

  // Second writer still holds the *original* ETag.
  await expect(
    repo.saveOrder({ ...first!.data, status: 'CANCELED' }, first!.etag),
  ).rejects.toBeInstanceOf(ConflictException);
});
```

If that test passes without an ETag ever being passed in, your read path is not returning one — go back to `getOrder()`.

---

## 2. Secret Store: Decoupled Secrets Management

Instead of embedding proprietary AWS Secrets Manager, HashiCorp Vault, or Azure Key Vault SDKs in our NestJS services, Dapr exposes a uniform secret retrieval API.

```
NestJS Service  ──►  Dapr Sidecar  ──►  HashiCorp Vault / AWS Secrets Manager
```

### 2.1 Implementing a Dapr Secret Provider in NestJS
```typescript
// apps/order-service/src/secrets/dapr-secret.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT } from '../dapr/dapr.module';

@Injectable()
export class DaprSecretService {
  private readonly secretStoreName = 'vault-secretstore';
  private readonly logger = new Logger(DaprSecretService.name);

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async getSecret(key: string): Promise<string> {
    try {
      const secrets = await this.daprClient.secret.get(this.secretStoreName, key);
      return secrets[key];
    } catch (error) {
      this.logger.error(`Failed to retrieve secret key '${key}' from ${this.secretStoreName}:`, error);
      throw new Error(`Secret '${key}' could not be resolved from Dapr.`);
    }
  }
}
```

### 🔍 Deep Dive: Secret Security & Performance
* **No Raw Credentials in Pod ENV**: Secrets stay in the centralized vault and are resolved dynamically in memory by the sidecar.
* **Sidecar Caching**: Dapr sidecars cache resolved secret values with configurable TTLs, preventing thousands of microservice replicas from overwhelming your HashiCorp Vault or AWS Secrets Manager rate limits.

---

## 3. Configuration Store: Dynamic Real-Time Config Streaming

Need to tweak rate limits or feature flags in production without triggering a rolling pod deployment? Dapr Configuration Store supports **dynamic real-time subscription streams**.

```typescript
// apps/order-service/src/config/dapr-dynamic-config.service.ts
import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT } from '../dapr/dapr.module';

const CONFIG_KEYS = ['max_items_per_order', 'feature_crypto_payments'];

@Injectable()
export class DaprDynamicConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly configStoreName = 'redis-configstore';
  private readonly logger = new Logger(DaprDynamicConfigService.name);
  private maxItemsPerOrder = 10;
  private unsubscribe?: () => void;

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async onModuleInit() {
    // Seed from current values first. A subscription only delivers *changes*,
    // so without this a process boots with the hardcoded default and stays
    // wrong until an operator happens to edit the key.
    await this.loadCurrentValues();
    await this.subscribeToConfigUpdates();
  }

  onModuleDestroy() {
    // Without this the gRPC stream outlives the Nest container — a leak on
    // every hot reload in dev and every pod recycle in production.
    this.unsubscribe?.();
  }

  private async loadCurrentValues() {
    try {
      const items = await this.daprClient.configuration.get(this.configStoreName, CONFIG_KEYS);
      this.applyItems(items);
      this.logger.log(`Seeded config from store: ${JSON.stringify(items)}`);
    } catch (error) {
      // Fail loudly. A config service that silently boots on defaults is worse
      // than one that refuses to start.
      this.logger.error(`Could not read initial config, using defaults: ${error.message}`);
    }
  }

  private async subscribeToConfigUpdates() {
    try {
      // `subscribe` returns an unsubscribe handle; it is not a stream of values.
      this.unsubscribe = await this.daprClient.configuration.subscribe(
        this.configStoreName,
        CONFIG_KEYS,
        (items) => {
          this.logger.log(`Dynamic config update received: ${JSON.stringify(items)}`);
          this.applyItems(items);
        },
      );

      this.logger.log('Subscribed to real-time Dapr configuration stream.');
    } catch (error) {
      // Do not swallow this. If the stream cannot be established, this process
      // is now frozen on whatever values it read at boot and nothing in the
      // system will tell you. Alert on this log line.
      this.logger.error(
        `Could not attach to Dapr config stream — config is now STALE for the life of this process: ${error.message}`,
      );
      throw error;
    }
  }

  private applyItems(items: Record<string, { value?: string }>) {
    const next = items['max_items_per_order']?.value;
    if (next !== undefined) {
      const parsed = Number(next);
      if (Number.isNaN(parsed)) {
        this.logger.error(`Ignoring non-numeric max_items_per_order: "${next}"`);
      } else {
        this.maxItemsPerOrder = parsed;
      }
    }
  }

  getMaxItems(): number {
    return this.maxItemsPerOrder;
  }
}
```

### 🔍 Deep Dive: Why gRPC Streams Beat Polling — and Where They Bite
* **Zero Polling Loops**: Instead of having every NestJS worker poll Redis every 5 seconds, Dapr establishes an open **gRPC bidirectional stream**.
* When an operator updates a config key in the store, the sidecar pushes the delta immediately to `(items) => { ... }`, updating in-memory variables in sub-millisecond time.
* **Subscriptions deliver changes, not state.** This is the mistake that costs you an afternoon: a fresh pod subscribes, hears nothing, and happily serves a hardcoded default that disagrees with the store. Always do an initial `get()`.
* **A dead stream is silent.** Unlike a failing request, a severed config stream produces no error at the call site — the process just quietly stops receiving updates. Re-throw on subscribe failure and alert on it, or your feature flags become lies.
* **Validate before you assign.** `Number("fifty")` is `NaN`, and a single `NaN` written into a rate limiter takes the whole endpoint down. Parse, check, log, and keep the last known-good value.

---

## 4. Pub/Sub: Asynchronous Event-Driven Architecture

In event-driven microservices, services communicate asynchronously via topics. Dapr wraps messages in a **CloudEvents** envelope (a CNCF spec) and carries the W3C trace context (`traceparent`) inside it, so traces follow a message across services without any code from you.

```
┌────────────────────────────────────────────────────────┐
│ OrderService (Publisher)                               │
│  └── daprClient.pubsub.publish('pubsub', 'orders', evt)│
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ Message Broker (Kafka / RabbitMQ / Redis Streams)      │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ PaymentService (Subscriber Endpoint)                   │
│  └── POST /dapr/subscribe  ──►  POST /events/orders    │
└────────────────────────────────────────────────────────┘
```

### 4.1 The Event Contract
```typescript
// shared/events/order-created.event.ts
export interface OrderCreatedEvent {
  orderId: string;
  customerId: string;
  totalAmount: number;
  currency: string;
  timestamp: number;
}
```

### 4.2 Publisher Implementation (`OrderService`)
```typescript
// apps/order-service/src/order.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT } from './dapr/dapr.module';
import { OrderCreatedEvent } from './events/order-created.event';

@Injectable()
export class OrderPublisherService {
  private readonly pubSubName = 'kafka-pubsub'; // Matches Dapr component name
  private readonly topic = 'orders.created';
  private readonly logger = new Logger(OrderPublisherService.name);

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async publishOrderCreated(event: OrderCreatedEvent): Promise<void> {
    this.logger.log(`Publishing event ${event.orderId} to topic '${this.topic}'...`);

    // Publishes serialized event wrapped in standard CloudEvents metadata
    await this.daprClient.pubsub.publish(this.pubSubName, this.topic, event);

    this.logger.log(`Event ${event.orderId} published successfully.`);
  }
}
```

### 4.3 Subscriber Implementation (`PaymentService`)
```typescript
// apps/payment-service/src/events/order-events.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { OrderCreatedEvent } from './order-created.event';

@Controller()
export class OrderEventsSubscriberController {
  private readonly logger = new Logger(OrderEventsSubscriberController.name);

  // 1. Dapr Programmatic Topic Discovery Endpoint (Handshake)
  @Get('dapr/subscribe')
  subscribeToTopics() {
    return [
      {
        pubsubname: 'kafka-pubsub',
        topic: 'orders.created',
        route: 'events/orders/created',
      },
    ];
  }

  // 2. Incoming Event Handler Endpoint
  @Post('events/orders/created')
  @HttpCode(HttpStatus.OK)
  async handleOrderCreated(@Body('data') eventData: OrderCreatedEvent) {
    this.logger.log(`Received OrderCreatedEvent for order ID: ${eventData.orderId}`);
    
    // Process async transaction logic
    this.logger.log(`Processed async billing record for amount: $${eventData.totalAmount}`);

    // Returning 200 OK signals SUCCESS to Dapr; message is ACKed in the message broker
    return { status: 'SUCCESS' };
  }
}
```

### 🔍 Deep Dive: The 2-Step Dapr Pub/Sub Handshake
1. **Bootstrapping Discovery (`GET /dapr/subscribe`)**:
   * On pod initialization, the Dapr sidecar calls `http://127.0.0.1:3001/dapr/subscribe` on your NestJS app.
   * Your controller returns an array specifying which topics to subscribe to and which internal HTTP route should handle each topic.
   * Dapr then handles the complex broker connections (creating consumer groups, partition assignments, and offset commits in Kafka).
2. **Event Delivery & ACK Semantics**:
   * When an event arrives on Kafka, Dapr transforms it into an HTTP `POST /events/orders/created` with the payload in `req.body.data`.
   * **`200 OK` / `{ status: 'SUCCESS' }`**: Dapr commits the offset (ACKs the message in Kafka/RabbitMQ).
   * **`500 Error` / `{ status: 'RETRY' }`**: Dapr refuses to commit the offset and triggers sidecar retry backoffs or routes to a Dead Letter Queue (DLQ).

---

## Summary of Building Blocks

| Building Block | NestJS Layer | Production Value |
| :--- | :--- | :--- |
| **State Store** | `OrderStateRepository` | Optimistic locking with ETags prevents write conflicts across microservice replicas. |
| **Secret Store** | `DaprSecretService` | Eliminates cloud SDK dependencies from Node.js; credentials resolved on demand. |
| **Config Store** | `DaprDynamicConfigService` | Stream dynamic runtime updates without redeploying pods. |
| **Pub/Sub** | `OrderPublisherService` & `Subscriber` | At-least-once asynchronous event streaming with automatic CloudEvents envelope framing and trace context propagation. |

---

## What’s Next in Part 4

Now that our microservices have state persistence, secrets, dynamic configs, and pub/sub events, we need to containerize, orchestrate, and deploy them.

In **[Part 4](/blog/nestjs-dapr-local-dev-production-kubernetes)**, we will build:
* Production-like local development with **Docker Compose** (NestJS + Dapr sidecars + Redis + Zipkin).
* Kubernetes deployment manifests with **automatic Dapr sidecar injection**.
* Production hardening: Health probes, mTLS, API tokens, and OpenTelemetry observability.
