---
title: "Part 3: Building Cloud-Native Microservices with NestJS and Dapr – State, Secrets, Config & Pub/Sub"
slug: "nestjs-dapr-state-secrets-config-pubsub"
description: "Implementing Dapr building blocks in NestJS: key-value state with ETag optimistic concurrency, dynamic secrets, real-time configuration streams, and CloudEvents pub/sub."
publishDate: "2026-08-14T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "dapr", "redis", "kafka", "microservices", "event-driven", "typescript"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Dapr building blocks architecture showing State Store, Secret Store, Configuration, and PubSub integration in NestJS"
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

### 1.2 State Repository Implementation
```typescript
// apps/order-service/src/order-state.repository.ts
import { Inject, Injectable, Logger, ConflictException } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT } from './dapr/dapr.module';

export interface OrderState {
  orderId: string;
  customerId: string;
  items: Array<{ sku: string; quantity: number }>;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELED';
  total: number;
}

export interface StoredOrder {
  data: OrderState;
  etag?: string;
}

@Injectable()
export class OrderStateRepository {
  private readonly storeName = 'order-statestore'; // Matches Dapr component name
  private readonly logger = new Logger(OrderStateRepository.name);

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async getOrder(orderId: string): Promise<StoredOrder | null> {
    const response = await this.daprClient.state.get(this.storeName, `order_${orderId}`);

    if (!response) {
      return null;
    }

    return {
      data: response as OrderState,
      etag: (response as any).etag,
    };
  }

  async saveOrder(order: OrderState, etag?: string): Promise<void> {
    try {
      await this.daprClient.state.save(this.storeName, [
        {
          key: `order_${order.orderId}`,
          value: order,
          etag: etag,
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
* **`etag` Parameter**: When `getOrder()` runs, Dapr returns both the state data and an opaque version hash (`etag: "1"`).
* **`concurrency: 'first-write'`**: When we pass `etag` to `saveOrder()`, Dapr instructs the underlying store (e.g., Redis via Lua scripts or DynamoDB conditional writes) to verify that the version hasn't changed.
* If a competing replica modified the order in the interim, Dapr returns an HTTP 409 Conflict, which our repository intercepts and converts into a clean NestJS `ConflictException`.

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
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DaprClient } from '@dapr/dapr';
import { DAPR_CLIENT } from '../dapr/dapr.module';

@Injectable()
export class DaprDynamicConfigService implements OnModuleInit {
  private readonly configStoreName = 'redis-configstore';
  private readonly logger = new Logger(DaprDynamicConfigService.name);
  private maxItemsPerOrder = 10;

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async onModuleInit() {
    await this.subscribeToConfigUpdates();
  }

  private async subscribeToConfigUpdates() {
    try {
      // Establishes a persistent gRPC server stream with the Dapr sidecar
      const stream = await this.daprClient.configuration.subscribe(
        this.configStoreName,
        ['max_items_per_order', 'feature_crypto_payments'],
        (items) => {
          this.logger.log(`Dynamic config update received: ${JSON.stringify(items)}`);
          if (items['max_items_per_order']) {
            this.maxItemsPerOrder = Number(items['max_items_per_order'].value);
          }
        },
      );

      this.logger.log('Subscribed to real-time Dapr configuration stream.');
    } catch (error) {
      this.logger.warn(`Could not attach to Dapr config stream: ${error.message}`);
    }
  }

  getMaxItems(): number {
    return this.maxItemsPerOrder;
  }
}
```

### 🔍 Deep Dive: Why gRPC Streams Beat Polling
* **Zero Polling Loops**: Instead of having every NestJS worker poll Redis every 5 seconds, Dapr establishes an open **gRPC bidirectional stream**.
* When an operator updates a config key in the store, the sidecar pushes the delta immediately to `(items) => { ... }`, updating in-memory variables in sub-millisecond time.

---

## 4. Pub/Sub: Asynchronous Event-Driven Architecture

In event-driven microservices, services communicate asynchronously via topics. Dapr wraps messages in standard **W3C CloudEvents** format, ensuring distributed trace context flows across message boundaries automatically.

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
