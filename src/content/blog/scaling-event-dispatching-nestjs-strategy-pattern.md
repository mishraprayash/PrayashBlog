---
title: "Scaling Multi-Channel Event Dispatching in NestJS: Strategy Pattern, Polymorphic DTOs, and OCP"
slug: "scaling-event-dispatching-nestjs-strategy-pattern"
description: "How to eliminate massive switch statements in event-driven backends: polymorphic class-validator DTOs, dynamic NestJS strategy registries, hierarchical webhook handlers, and isolated queues."
publishDate: "2026-07-16T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "typescript", "architecture", "design-patterns", "backend"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "NestJS Strategy and Factory Pattern architecture diagram for multi-channel event dispatching"
draft: false
---

Every backend notification system starts simple. You write a helper function to send an email via SendGrid, and it works cleanly.

Then product asks for **SMS alerts via Twilio**. Then **Webhooks for enterprise customers**. Then **Push notifications via FCM**, followed by **Slack bots and Discord integrations**.

Within six months, that innocent helper function metastasizes into a **700-line monolithic `switch(channel)` monster**:

```
Request / Queue Event
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│ Monolithic NotificationService (Violates OCP)             │
│                                                           │
│  switch (event.channel) {                                 │
│    case "EMAIL":   sendGrid.send(payload);                │
│    case "SMS":     twilio.messages.create(payload);       │
│    case "WEBHOOK": axios.post(payload.url, payload.data); │
│    case "SLACK":   slackClient.chat.postMessage(...);     │
│  }                                                        │
└───────────────────────────────────────────────────────────┘
```

The problems hit quickly:
1. **Payload chaos (`any` typing)**: SMS needs an `E.164` phone number, Webhooks need target URLs and HMAC secrets, and Emails need HTML templates. A generic `payload: any` guarantees runtime crashes.
2. **Open/Closed Principle (OCP) violation**: Adding Discord integration requires editing and redeploying the core dispatcher file, risking regressions in transactional emails.
3. **Sub-Event Explosion**: Within Webhooks alone, you emit completely different event shapes (`order.created`, `payment.succeeded`, `user.verified`), all requiring canonical signatures and serialization.
4. **Cascading failure**: If a slow customer webhook endpoint times out after 30 seconds, it hogs worker concurrency and stalls critical password-reset emails.

Here is how I architected our notification and event dispatching engine using **Polymorphic Runtime DTO validation**, **Hierarchical Strategy Registries**, and **isolated queue execution** in NestJS.

---

## 1. The Anti-Pattern: The Monolithic `switch` Monster

Here is the bad code pattern that plagues growing codebases:

```typescript
// ❌ ANTI-PATTERN: Brittle, untyped, and tightly coupled
@Injectable()
export class BadNotificationService {
  constructor(
    private sendgrid: SendGridService,
    private twilio: TwilioService,
    private http: HttpService,
  ) {}

  async dispatch(event: { channel: string; payload: any }) {
    switch (event.channel) {
      case 'EMAIL':
        if (!event.payload.to || !event.payload.subject) {
          throw new BadRequestException('Invalid email payload');
        }
        return this.sendgrid.send(event.payload);

      case 'SMS':
        if (!event.payload.phoneNumber) {
          throw new BadRequestException('Invalid SMS payload');
        }
        return this.twilio.sendSms(event.payload.phoneNumber, event.payload.message);

      case 'WEBHOOK':
        // If this times out or throws, the entire worker crashes!
        return this.http.axiosRef.post(event.payload.url, event.payload.body, {
          headers: { 'X-Signature': event.payload.signature },
        });

      default:
        throw new BadRequestException(`Unsupported channel: ${event.channel}`);
    }
  }
}
```

### Why this breaks in production:
* **Zero Encapsulation**: A single service injects every external SDK in existence.
* **Testing Nightmare**: Writing unit tests for `BadNotificationService` requires mocking 15 different dependencies.
* **Fragile Types**: `payload: any` bypasses TypeScript and NestJS `ValidationPipe`.

---

## 2. Polymorphic Runtime Validation with `class-transformer`

In TypeScript, **Discriminated Unions** are great at compile time, but incoming HTTP bodies and queue messages arrive as untyped JSON at runtime.

To enforce strict validation per channel type, we combine `class-validator` with `class-transformer` discriminators:

```typescript
// notification-payload.dto.ts
import { Type } from 'class-transformer';
import { 
  IsEnum, 
  IsNotEmpty, 
  IsPhoneNumber, 
  IsString, 
  IsUrl, 
  ValidateNested 
} from 'class-validator';

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WEBHOOK = 'WEBHOOK',
}

// 1. Channel-Specific DTOs
export class EmailPayloadDto {
  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  htmlBody: string;
}

export class SmsPayloadDto {
  @IsPhoneNumber() // Validates E.164 international format (+1234567890)
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class BaseWebhookPayloadDto {
  @IsUrl({ require_tld: true, require_protocol: true })
  targetUrl: string;

  @IsString()
  signingSecret: string;
}

// 2. Top-Level Polymorphic Wrapper DTO
export class DispatchNotificationDto {
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ValidateNested()
  @Type((opts) => {
    // Dynamically select target validation class based on the channel field
    const channel = opts?.object?.channel;
    switch (channel) {
      case NotificationChannel.EMAIL:
        return EmailPayloadDto;
      case NotificationChannel.SMS:
        return SmsPayloadDto;
      case NotificationChannel.WEBHOOK:
        return WebhookDispatchDto; // Detailed in Section 4
      default:
        return Object;
    }
  })
  payload: EmailPayloadDto | SmsPayloadDto | any;
}
```

If a client sends an SMS event with a missing phone number, NestJS's global `ValidationPipe` rejects the request **at the perimeter** with `400 Bad Request` before any strategy code executes.

---

## 3. Tier 1: Channel Strategy & Registry Factory

We define a strict contract that every top-level notification channel must fulfill:

```typescript
// notification-strategy.interface.ts
export interface NotificationStrategy<T = any> {
  readonly channel: NotificationChannel;
  send(payload: T): Promise<{ success: boolean; messageId?: string }>;
}
```

### The Strategy Registry (OCP Extensibility)
Instead of a switch statement, NestJS resolves strategies into an O(1) lookup map:

```typescript
// notification-registry.service.ts
@Injectable()
export class NotificationRegistryService implements OnModuleInit {
  private readonly strategies = new Map<NotificationChannel, NotificationStrategy>();

  constructor(
    private readonly emailStrategy: EmailStrategy,
    private readonly smsStrategy: SmsStrategy,
    private readonly webhookStrategy: WebhookStrategy,
  ) {}

  onModuleInit() {
    this.register(this.emailStrategy);
    this.register(this.smsStrategy);
    this.register(this.webhookStrategy);
  }

  private register(strategy: NotificationStrategy) {
    this.strategies.set(strategy.channel, strategy);
  }

  getStrategy(channel: NotificationChannel): NotificationStrategy {
    const strategy = this.strategies.get(channel);
    if (!strategy) {
      throw new UnprocessableEntityException(`No strategy registered for channel: ${channel}`);
    }
    return strategy;
  }
}
```

The top-level dispatcher has a single, elegant responsibility:
```typescript
@Injectable()
export class NotificationDispatcherService {
  constructor(private readonly registry: NotificationRegistryService) {}

  async dispatch(dto: DispatchNotificationDto) {
    const strategy = this.registry.getStrategy(dto.channel);
    return strategy.send(dto.payload);
  }
}
```

---

## 4. Tier 2: Handling Multi-Event Webhook Sub-Types

Now let's tackle the deeper real-world challenge: **What if all webhooks share a single delivery engine, but emit 3+ distinct domain event types across the platform?**

For example:
1. `order.created` → `{ orderId, items[], totalAmount, currency }`
2. `payment.succeeded` → `{ transactionId, amount, paymentMethod, receiptUrl }`
3. `user.verified` → `{ userId, status, documentType, verifiedAt }`

All three must share the **unified webhook delivery pipeline**:
* Standardized envelope (`{ id, event, timestamp, data }`).
* Cryptographic HMAC SHA-256 signature (`X-Signature`, `X-Timestamp`).
* Payload sanitization & PII redaction.
* Timeout budgets and HTTP retries.

```
WebhookDispatchDto
        │
        ├── 1. Discriminated Sub-DTO Validation (order.created / payment.succeeded)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ WebhookStrategy (The Delivery Engine)                       │
│  ├── 1. Looks up WebhookEventTransformer in Sub-Registry   │
│  ├── 2. Normalizes & redacts payload data                   │
│  ├── 3. Builds Canonical Envelope                           │
│  ├── 4. Signs Payload (HMAC SHA-256)                        │
│  └── 5. POST to customer targetUrl (5s timeout)             │
└─────────────────────────────────────────────────────────────┘
```

### 4.1 Discriminated Webhook DTOs
We create specific validation schemas for each webhook event:

```typescript
// webhook-events.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsString, IsUrl, ValidateNested } from 'class-validator';

export enum WebhookEventType {
  ORDER_CREATED = 'order.created',
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  USER_VERIFIED = 'user.verified',
}

// Specific Event Data DTOs
export class OrderCreatedDataDto {
  @IsString() orderId: string;
  @IsArray() items: Array<{ sku: string; quantity: number }>;
  @IsNumber() totalAmount: number;
  @IsString() currency: string;
}

export class PaymentSucceededDataDto {
  @IsString() transactionId: string;
  @IsNumber() amount: number;
  @IsString() paymentMethod: string;
  @IsUrl() receiptUrl: string;
}

export class UserVerifiedDataDto {
  @IsString() userId: string;
  @IsString() status: 'APPROVED' | 'REJECTED';
  @IsString() documentType: string;
}

// Discriminated Webhook Envelope DTO
export class WebhookDispatchDto extends BaseWebhookPayloadDto {
  @IsEnum(WebhookEventType)
  eventType: WebhookEventType;

  @ValidateNested()
  @Type((opts) => {
    switch (opts?.object?.eventType) {
      case WebhookEventType.ORDER_CREATED:
        return OrderCreatedDataDto;
      case WebhookEventType.PAYMENT_SUCCEEDED:
        return PaymentSucceededDataDto;
      case WebhookEventType.USER_VERIFIED:
        return UserVerifiedDataDto;
      default:
        return Object;
    }
  })
  data: OrderCreatedDataDto | PaymentSucceededDataDto | UserVerifiedDataDto;
}
```

### 4.2 Webhook Event Transformers (Sub-Strategies)
We define a sub-strategy interface to format and sanitize domain events:

```typescript
// webhook-transformer.interface.ts
export interface WebhookEventTransformer<T = any> {
  readonly eventType: WebhookEventType;
  transform(raw: T): Record<string, any>;
}

@Injectable()
export class OrderCreatedTransformer implements WebhookEventTransformer<OrderCreatedDataDto> {
  readonly eventType = WebhookEventType.ORDER_CREATED;

  transform(data: OrderCreatedDataDto) {
    return {
      order_id: data.orderId,
      item_count: data.items.length,
      line_items: data.items,
      amount_cents: Math.round(data.totalAmount * 100),
      currency: data.currency.toUpperCase(),
    };
  }
}

@Injectable()
export class PaymentSucceededTransformer implements WebhookEventTransformer<PaymentSucceededDataDto> {
  readonly eventType = WebhookEventType.PAYMENT_SUCCEEDED;

  transform(data: PaymentSucceededDataDto) {
    return {
      transaction_id: data.transactionId,
      amount: data.amount,
      payment_method: data.paymentMethod,
      receipt_url: data.receiptUrl,
    };
  }
}
```

### 4.3 The Unified Webhook Delivery Engine
The `WebhookStrategy` brings everything together without a single `switch` statement:

```typescript
// webhook.strategy.ts
import * as crypto from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class WebhookStrategy implements NotificationStrategy<WebhookDispatchDto>, OnModuleInit {
  readonly channel = NotificationChannel.WEBHOOK;
  private readonly transformers = new Map<WebhookEventType, WebhookEventTransformer>();

  constructor(
    private readonly http: HttpService,
    private readonly orderTransformer: OrderCreatedTransformer,
    private readonly paymentTransformer: PaymentSucceededTransformer,
  ) {}

  onModuleInit() {
    this.transformers.set(this.orderTransformer.eventType, this.orderTransformer);
    this.transformers.set(this.paymentTransformer.eventType, this.paymentTransformer);
  }

  async send(payload: WebhookDispatchDto) {
    // 1. Resolve transformer sub-strategy
    const transformer = this.transformers.get(payload.eventType);
    const sanitizedData = transformer ? transformer.transform(payload.data) : payload.data;

    // 2. Build Canonical Webhook Envelope
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const webhookEnvelope = {
      id: `evt_${crypto.randomUUID()}`,
      event: payload.eventType,
      created_at: Number(timestamp),
      api_version: '2026-08-01',
      data: sanitizedData,
    };

    // 3. Compute HMAC SHA-256 signature
    const signature = this.generateSignature(webhookEnvelope, payload.signingSecret, timestamp);

    // 4. Transmit with strict timeout budget
    await this.http.axiosRef.post(payload.targetUrl, webhookEnvelope, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp,
        'X-Webhook-ID': webhookEnvelope.id,
      },
      timeout: 5000, // 5s timeout budget
    });

    return { success: true, messageId: webhookEnvelope.id };
  }

  private generateSignature(body: object, secret: string, timestamp: string): string {
    const serialized = JSON.stringify(body);
    return crypto
      .createHmac('sha256', secret)
      .update(`t=${timestamp},v1=${serialized}`)
      .digest('hex');
  }
}
```

> **The Extensibility Win:** When you add a 4th webhook event (`subscription.canceled`):
> 1. Add `SubscriptionCanceledDataDto`.
> 2. Create `SubscriptionCanceledTransformer`.
> 3. Register it in `WebhookStrategy`.
> 4. **The signing logic, retry machinery, and HTTP transmission code remain untouched.**

---

## 5. Real-World Production Traps

### 1. The Poison Pill Queue Loop
When dispatching through background queues (e.g., **BullMQ** or **RabbitMQ**), if a message with an invalid payload enters the queue, a naive worker throws an unhandled error. BullMQ retries the job 5 times, failing each time and exhausting CPU/database bandwidth.

**Fix:** Run `validateOrReject(plainToInstance(DispatchNotificationDto, job.data))` inside the worker. If validation fails, immediately discard or route the job to a **Dead Letter Queue (DLQ)** with zero retries.

### 2. Slow Webhook Starvation
If you process Emails and Webhooks in the same shared worker pool:
* An email takes ~100 ms to send.
* A slow customer webhook endpoint can hang for 30 seconds before timing out.

A sudden burst of 50 slow webhooks consumes all 50 BullMQ worker concurrency slots, halting all password resets across the company!

**Fix:** Isolate queue names per channel:
```typescript
@InjectQueue('notifications-email') private emailQueue: Queue;
@InjectQueue('notifications-webhook') private webhookQueue: Queue;
```

### 3. Idempotency & Deduplication
If an SMS fails due to a network glitch *after* Twilio accepted it, a queue retry will send a duplicate SMS and double-charge the customer.

**Fix:** Generate deterministic `jobId`s in BullMQ:
```typescript
await this.smsQueue.add('send-sms', payload, {
  jobId: `sms_${event.id}_${event.recipientPhone}`, // Prevents duplicate execution within backoff window
});
```

---

## Production Rules: What to Enforce

* **Polymorphic DTOs**: Use `@Type` with discriminators to validate dynamic payloads at runtime.
* **Tier 1 Strategy Registry**: Isolate top-level channels (Email, SMS, Webhooks) into testable strategy classes.
* **Tier 2 Event Transformers**: Sub-strategies format and sanitize specific webhook domain events (`order.created`, `payment.succeeded`) before passing them to the shared signature pipeline.
* **Queue Isolation**: Separate fast transactional channels (Email/SMS) from high-latency external endpoints (Webhooks).
* **Strict Timeouts**: Always put hard timeouts (e.g., 5s) on outgoing HTTP calls in webhook strategies.
