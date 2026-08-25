---
title: "Part 2: Building Cloud-Native Microservices with NestJS and Dapr – NestJS Module & Service Invocation"
slug: "nestjs-dapr-nestjs-integration-service-invocation"
description: "How to integrate Dapr cleanly in NestJS: building a dynamic DaprModule, structuring independent microservices, and handling synchronous Service Invocation with mTLS."
publishDate: "2026-08-07T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "dapr", "microservices", "typescript", "architecture", "grpc"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "NestJS Service Invocation flow through Dapr sidecars using HTTP and gRPC protocols"
draft: false
---

In **[Part 1](/blog/nestjs-dapr-core-fundamentals-architecture)**, we explored the fundamentals of Dapr as a distributed sidecar runtime and contrasted it with native `@nestjs/microservices`.

Now, let’s build a clean, production-grade integration. Instead of scattering raw `new DaprClient()` instances across our backend, we will organize our codebase following the **standard NestJS Monorepo architecture**, encapsulate Dapr into a **reusable NestJS Dynamic Module (`libs/dapr`)**, and implement synchronous **Service Invocation** between two independent microservices: `OrderService` and `PaymentService`.

---

## 1. Standard NestJS Microservices Repository Architecture

In enterprise microservices, you should avoid creating separate disconnected repositories for every small service or duplicating Dapr integration code. 

Using **NestJS Monorepo mode** (`nest generate app ...` / `nest generate lib ...`), we centralize shared contracts, Dapr dynamic modules, and infrastructure YAMLs in a single cohesive repository:

```
nestjs-dapr-monorepo/
├── apps/
│   ├── order-service/               # Order Microservice (Port 3000 / Dapr 3500)
│   │   ├── src/
│   │   │   ├── config/              # Dynamic Dapr config subscribers
│   │   │   ├── events/              # Pub/Sub topic publishers
│   │   │   ├── state/               # ETag state repositories
│   │   │   ├── app.module.ts        # Imports @app/dapr
│   │   │   ├── main.ts              # Bootstrap entrypoint
│   │   │   ├── order.controller.ts  # HTTP routes
│   │   │   └── order.service.ts     # Business logic & Service Invocation
│   │   ├── Dockerfile
│   │   └── tsconfig.app.json
│   │
│   └── payment-service/             # Payment Microservice (Port 3001 / Dapr 3501)
│       ├── src/
│       │   ├── events/              # Pub/Sub topic subscribers (/dapr/subscribe)
│       │   ├── app.module.ts
│       │   ├── main.ts
│       │   ├── payment.controller.ts# Target of OrderService Invocation
│       │   └── payment.service.ts
│       ├── Dockerfile
│       └── tsconfig.app.json
│
├── libs/
│   ├── dapr/                        # Shared Reusable Dynamic Dapr Module
│   │   ├── src/
│   │   │   ├── dapr.interfaces.ts   # Configuration interfaces
│   │   │   ├── dapr.module.ts       # Dynamic module (forRootAsync)
│   │   │   └── index.ts             # Public export barrier
│   │   └── tsconfig.lib.json
│   │
│   └── shared-contracts/            # Shared DTOs & CloudEvents
│       ├── src/
│       │   ├── dto/
│       │   │   └── payment.dto.ts   # Inter-service request/response DTOs
│       │   ├── events/
│       │   │   └── order-created.ts # W3C CloudEvent contracts
│       │   └── index.ts
│       └── tsconfig.lib.json
│
├── dapr/                            # Declarative Infrastructure Manifests
│   ├── components/
│   │   ├── statestore.yaml          # State store (Redis / CosmosDB)
│   │   ├── pubsub.yaml              # Pub/Sub broker (Redis / Kafka)
│   │   ├── secretstore.yaml         # Secret store (Vault / AWS Secrets)
│   │   └── configstore.yaml         # Configuration store
│   ├── config/
│   │   └── config.yaml              # OpenTelemetry tracing & metric samplers
│   └── resiliency/
│       └── resiliency.yaml          # Retries, timeouts, circuit breakers
│
├── deploy/                          # Infrastructure & Deployment
│   ├── docker/
│   │   └── docker-compose.yml       # Local multi-container development
│   └── k8s/
│       ├── order-deployment.yaml    # Kubernetes manifests with dapr.io annotations
│       ├── payment-deployment.yaml
│       └── components/              # Production K8s Component CRDs
│
├── nest-cli.json                    # NestJS Monorepo configuration
├── package.json
└── tsconfig.base.json
```

---

## 2. Building a Dynamic `DaprModule` in NestJS

To adhere to NestJS Dependency Injection and inversion of control, we wrap the official `@dapr/dapr` SDK into a dynamic module that supports asynchronous configuration (e.g., loading host/port settings from `@nestjs/config`).

```
┌─────────────────────────────────────────────────────────────┐
│ DaprModule (Dynamic Module)                                 │
│  ├── Provides DAPR_CLIENT (DaprClient Instance)            │
│  └── Provides DAPR_SERVER (DaprServer Instance)            │
└─────────────────────────────────────────────────────────────┘
                              │ Injectable
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Any NestJS Service (e.g., OrderService, PaymentService)     │
│  constructor(@Inject(DAPR_CLIENT) private dapr: DaprClient) │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Module Options & Interfaces
First, we define our configuration contract:

```typescript
// src/dapr/dapr.interfaces.ts
import { CommunicationProtocolEnum } from '@dapr/dapr';
import { ModuleMetadata, Type } from '@nestjs/common';

export interface DaprModuleOptions {
  daprHost?: string;
  daprPort?: string;
  serverHost?: string;
  serverPort?: string;
  communicationProtocol?: CommunicationProtocolEnum;
}

export interface DaprOptionsFactory {
  createDaprOptions(): Promise<DaprModuleOptions> | DaprModuleOptions;
}

export interface DaprModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<DaprOptionsFactory>;
  useClass?: Type<DaprOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<DaprModuleOptions> | DaprModuleOptions;
  inject?: any[];
}
```

### 1.2 The Dynamic Module Implementation
Next, we implement `DaprModule` using `forRootAsync`:

```typescript
// src/dapr/dapr.module.ts
import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { DaprClient, DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import { DaprModuleAsyncOptions, DaprModuleOptions } from './dapr.interfaces';

export const DAPR_CLIENT = 'DAPR_CLIENT';
export const DAPR_SERVER = 'DAPR_SERVER';
export const DAPR_MODULE_OPTIONS = 'DAPR_MODULE_OPTIONS';

@Global()
@Module({})
export class DaprModule {
  static forRootAsync(options: DaprModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    // 1. DaprClient Provider: Used for outgoing requests, state, secrets, and pub/sub publishing
    const daprClientProvider: Provider = {
      provide: DAPR_CLIENT,
      useFactory: (daprOptions: DaprModuleOptions) => {
        return new DaprClient({
          daprHost: daprOptions.daprHost || '127.0.0.1',
          daprPort: daprOptions.daprPort || '3500',
          communicationProtocol: daprOptions.communicationProtocol || CommunicationProtocolEnum.HTTP,
        });
      },
      inject: [DAPR_MODULE_OPTIONS],
    };

    // 2. DaprServer Provider: Used for listening to incoming topic subscriptions and input bindings
    const daprServerProvider: Provider = {
      provide: DAPR_SERVER,
      useFactory: (daprOptions: DaprModuleOptions) => {
        return new DaprServer({
          serverHost: daprOptions.serverHost || '127.0.0.1',
          serverPort: daprOptions.serverPort || '3000',
          clientOptions: {
            daprHost: daprOptions.daprHost || '127.0.0.1',
            daprPort: daprOptions.daprPort || '3500',
            communicationProtocol: daprOptions.communicationProtocol || CommunicationProtocolEnum.HTTP,
          },
        });
      },
      inject: [DAPR_MODULE_OPTIONS],
    };

    return {
      module: DaprModule,
      imports: options.imports || [],
      providers: [...asyncProviders, daprClientProvider, daprServerProvider],
      exports: [DAPR_CLIENT, DAPR_SERVER],
    };
  }

  private static createAsyncProviders(options: DaprModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: DAPR_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ];
    }
    throw new Error('Invalid DaprModuleAsyncOptions: useFactory is required.');
  }
}
```

### 🔍 Deep Dive: How the Module Lifecycle Works
1. **`@Global()` Decorator**: By marking `DaprModule` as global, we configure it once in our root `AppModule`. Every downstream feature module can inject `DAPR_CLIENT` without re-importing the module.
2. **Separation of Client vs. Server**:
   * **`DaprClient`**: Manages outgoing HTTP/gRPC communication to the local Dapr sidecar (port 3500/50001) for RPC, state CRUD, secrets, and publishing events.
   * **`DaprServer`**: Sets up the listener infrastructure for incoming pub/sub topic subscriptions and external trigger bindings dispatched from the sidecar to our NestJS app (port 3000).
3. **`inject: [DAPR_MODULE_OPTIONS]`**: Inversion of control ensures that our environment variables (e.g. `DAPR_HTTP_PORT`) are fully loaded and validated by NestJS `@nestjs/config` before the `DaprClient` is instantiated.

---

## 2. Microservices Architecture Setup

We instantiate two isolated NestJS services configured to communicate through their respective Dapr sidecars:

```
┌────────────────────────────────────────┐       ┌────────────────────────────────────────┐
│ Order Microservice (app-id: order-app) │       │ Payment Microservice (app-id: pay-app) │
│                                        │       │                                        │
│  NestJS App: Port 3000                 │       │  NestJS App: Port 3001                 │
│  Dapr Sidecar: HTTP 3500, gRPC 50001   │       │  Dapr Sidecar: HTTP 3501, gRPC 50002   │
└──────────────────┬─────────────────────┘       └───────────────────▲────────────────────┘
                   │                                                 │
                   │  Service Invocation (daprClient.invoker.invoke) │
                   └─────────────────────────────────────────────────┘
```

### 2.1 Importing `DaprModule` in `OrderService`
```typescript
// apps/order-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CommunicationProtocolEnum } from '@dapr/dapr';
import { DaprModule } from './dapr/dapr.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DaprModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        daprHost: config.get<string>('DAPR_HOST', '127.0.0.1'),
        daprPort: config.get<string>('DAPR_HTTP_PORT', '3500'),
        communicationProtocol: CommunicationProtocolEnum.HTTP,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class AppModule {}
```

---

## 3. Service Invocation Layer: Synchronous Inter-Service Communication

Now we implement synchronous communication where `OrderService` invokes `PaymentService` to process a credit transaction.

### 3.1 The DTO Contracts
```typescript
// shared/dto/payment.dto.ts
import { IsNotEmpty, IsNumber, IsPositive, IsString, IsUUID } from 'class-validator';

export class ProcessPaymentDto {
  @IsUUID()
  orderId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;
}

export interface PaymentResponseDto {
  transactionId: string;
  status: 'SUCCESS' | 'DECLINED';
  timestamp: number;
}
```

### 3.2 The Target Endpoint in `PaymentService`
`PaymentService` exposes a standard NestJS REST controller on port 3001:

```typescript
// apps/payment-service/src/payment.controller.ts
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ProcessPaymentDto, PaymentResponseDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentController {
  @Post('process')
  @HttpCode(HttpStatus.OK)
  async processPayment(@Body() dto: ProcessPaymentDto): Promise<PaymentResponseDto> {
    // Business logic: Charge account, verify balance
    return {
      transactionId: `txn_${Date.now()}`,
      status: 'SUCCESS',
      timestamp: Date.now(),
    };
  }
}
```

### 3.3 Invoking the Remote Service from `OrderService`
In `OrderService`, we inject `DAPR_CLIENT` and call `PaymentService` using Dapr's Service Invocation API. Notice how we **never provide an IP address or hostname for PaymentService**—we reference its unique **Dapr App ID (`payment-app`)**:

```typescript
// apps/order-service/src/order.service.ts
import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DaprClient, HttpMethod } from '@dapr/dapr';
import { DAPR_CLIENT } from './dapr/dapr.module';
import { ProcessPaymentDto, PaymentResponseDto } from './dto/payment.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(@Inject(DAPR_CLIENT) private readonly daprClient: DaprClient) {}

  async createOrder(orderId: string, amount: number, currency: string) {
    this.logger.log(`Initiating order ${orderId}...`);

    const paymentPayload: ProcessPaymentDto = { orderId, amount, currency };

    try {
      // Direct synchronous RPC through Dapr sidecar
      const response = await this.daprClient.invoker.invoke(
        'payment-app',          // Target Dapr App ID
        'payments/process',     // Method / Route on target service
        HttpMethod.POST,        // HTTP Method
        paymentPayload,         // Payload
      );

      const paymentResult = response as PaymentResponseDto;

      if (paymentResult.status !== 'SUCCESS') {
        throw new Error(`Payment declined for order ${orderId}`);
      }

      this.logger.log(`Order ${orderId} confirmed with Transaction: ${paymentResult.transactionId}`);
      return { orderId, status: 'CONFIRMED', transactionId: paymentResult.transactionId };
    } catch (error) {
      this.logger.error(`Failed to process order ${orderId} via payment-app:`, error.message);
      throw new InternalServerErrorException('Order processing failed due to upstream payment error.');
    }
  }
}
```

### 🔍 Deep Dive: Line-by-Line Invocation Breakdown
* **`this.daprClient.invoker.invoke('payment-app', 'payments/process', ...)`**:
  * **Target App ID (`'payment-app'`)**: Instead of coupling to `http://payment-service:3001`, your app delegates location discovery to Dapr.
  * **Route (`'payments/process'`)**: Dapr translates this into an internal forwarding call to the endpoint defined on `PaymentService`'s NestJS controller.
  * **Protocol Transparency**: By default, the SDK uses HTTP/1.1 or gRPC over loopback. Between the two sidecars across the cluster, Dapr upgrades the transmission to high-performance **gRPC over mTLS**.

---

## 4. Declarative Resiliency: Retries & Circuit Breakers Without Code Changes

One of the biggest advantages of Dapr over manual Axios/Fetch calls in NestJS is **Declarative Resiliency**. If `PaymentService` starts failing, you don't write complex RxJS retry pipes or install resilience libraries in Node.js. You attach a Dapr Resiliency YAML:

```yaml
# k8s/components/resiliency.yaml
apiVersion: dapr.io/v1alpha1
kind: Resiliency
metadata:
  name: microservice-resiliency
spec:
  policies:
    retries:
      paymentRetry:
        policy: exponential
        maxRetries: 3
        maxInterval: 3s
    circuitBreakers:
      paymentCB:
        maxRequests: 1
        timeout: 10s
        trip: consecutiveFailures >= 5
  targets:
    apps:
      payment-app:
        retry: paymentRetry
        circuitBreaker: paymentCB
```

### How this protects your NestJS services:
1. **Zero Node.js CPU Overhead**: Exponential backoff calculations and thread sleep timers are executed entirely inside the Go-based Dapr sidecar runtime.
2. **Automatic Circuit Breaking**: If `payment-app` throws 5 consecutive 500 errors, the Dapr sidecar trips the circuit breaker and immediately fails fast for 10 seconds, protecting `OrderService` from cascading connection stalls.

---

## What’s Next in Part 3

Now that we have clean synchronous inter-service communication and declarative resilience, we will explore Dapr's stateful and asynchronous primitives.

In **[Part 3](/blog/nestjs-dapr-state-secrets-config-pubsub)**, we will build:
* **State Management**: Key-value stores with ETag optimistic concurrency control in Redis/CosmosDB.
* **Secret Store**: Fetching secrets without cloud SDK lock-in.
* **Dynamic Configuration**: Subscribing to live config streams.
* **Publish & Subscribe**: Asynchronous event publishing and NestJS topic subscriber controllers.
