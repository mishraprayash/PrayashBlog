---
title: "Part 4: Building Cloud-Native Microservices with NestJS and Dapr – Local Dev & Production Kubernetes"
slug: "nestjs-dapr-local-dev-production-kubernetes"
description: "How to ship NestJS and Dapr microservices: multi-container local Docker Compose pipelines, Kubernetes sidecar injection, production YAML components, and OpenTelemetry observability."
publishDate: "2026-08-21T10:00:00Z"
author: "Prayash Mishra"
tags: ["nestjs", "dapr", "kubernetes", "docker", "devops", "observability", "production"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Kubernetes cluster architecture showing Dapr control plane, sidecar injection, and production OpenTelemetry observability"
draft: false
---

In **[Part 1](/blog/nestjs-dapr-core-fundamentals-architecture)**, **[Part 2](/blog/nestjs-dapr-nestjs-integration-service-invocation)**, and **[Part 3](/blog/nestjs-dapr-state-secrets-config-pubsub)** of this guide, we built a fully featured, event-driven NestJS microservices backend powered by Dapr.

Now comes the hard part: **How do we run this locally without pulling our hair out, and how do we harden it for enterprise Kubernetes production?**

Here is the complete blueprint.

---

## 1. Local Development: Production-Like Docker Compose Setup

In local development, you can run services via the Dapr CLI (`dapr run --app-id order-app ...`). However, for multi-service architectures, a multi-container **Docker Compose** setup guarantees identical networking and parity across team members.

```
┌─────────────────────────────────────────────────────────────┐
│ Docker Compose Environment                                  │
│                                                             │
│  ┌───────────────────────┐        ┌──────────────────────┐  │
│  │ order-service (:3000) │ ◄────► │ order-dapr (:3500)   │  │
│  └───────────────────────┘        └──────────┬───────────┘  │
│                                              │              │
│  ┌───────────────────────┐        ┌──────────┴───────────┐  │
│  │ payment-service(:3001)│ ◄────► │ payment-dapr (:3501) │  │
│  └───────────────────────┘        └──────────┬───────────┘  │
│                                              │              │
│                 ┌────────────────────────────┴───┐          │
│                 ▼                                ▼          │
│        ┌─────────────────┐             ┌──────────────────┐ │
│        │  Redis (:6379)  │             │  Zipkin (:9411)  │ │
│        │  (State/PubSub) │             │  (Tracing UI)    │ │
│        └─────────────────┘             └──────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Local Dapr Component Manifests
Create a `./components` directory containing local Redis component definitions:

```yaml
# ./components/statestore.yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: order-statestore
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis:6379
    - name: redisPassword
      value: ""
```

```yaml
# ./components/pubsub.yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: kafka-pubsub
spec:
  type: pubsub.redis
  version: v1
  metadata:
    - name: redisHost
      value: redis:6379
    - name: redisPassword
      value: ""
```

### 1.2 The Multi-Container `docker-compose.yml`
```yaml
# docker-compose.yml
version: '3.8'

services:
  # 1. Shared Infrastructure
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  zipkin:
    image: openzipkin/zipkin:latest
    ports:
      - "9411:9411"

  # 2. Order Microservice App & Dapr Sidecar
  order-service:
    build:
      context: .
      dockerfile: apps/order-service/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DAPR_HOST=127.0.0.1
      - DAPR_HTTP_PORT=3500
    depends_on:
      - redis

  order-dapr:
    image: daprio/daprd:1.14.0
    command: [
      "./daprd",
      "-app-id", "order-app",
      "-app-port", "3000",
      "-dapr-http-port", "3500",
      "-dapr-grpc-port", "50001",
      "-components-path", "/components",
      "-config", "/config/config.yaml"
    ]
    volumes:
      - "./components:/components"
      - "./config:/config"
    depends_on:
      - order-service
    network_mode: "service:order-service" # Shares network namespace with app container

  # 3. Payment Microservice App & Dapr Sidecar
  payment-service:
    build:
      context: .
      dockerfile: apps/payment-service/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - DAPR_HOST=127.0.0.1
      - DAPR_HTTP_PORT=3501
    depends_on:
      - redis

  payment-dapr:
    image: daprio/daprd:1.14.0
    command: [
      "./daprd",
      "-app-id", "payment-app",
      "-app-port", "3001",
      "-dapr-http-port", "3501",
      "-dapr-grpc-port", "50002",
      "-components-path", "/components"
    ]
    volumes:
      - "./components:/components"
    depends_on:
      - payment-service
    network_mode: "service:payment-service" # Shares network namespace with app container
```

### 🔍 Deep Dive: Why `network_mode: "service:..."` is Essential
* Notice `network_mode: "service:order-service"` on the `order-dapr` container.
* In standard Docker Compose, each container gets its own isolated network interface and IP address.
* By specifying `network_mode: "service:order-service"`, Docker attaches `order-dapr` directly to `order-service`'s Linux network namespace. Both containers share `127.0.0.1` (localhost), exactly mirroring how a multi-container Kubernetes Pod operates!

---

## 2. Production Deployment on Kubernetes

In Kubernetes, you do not manually write sidecar containers. Dapr provides a **Kubernetes Operator** and **Admission Webhook Injector** that injects `daprd` sidecars automatically.

```
┌────────────────────────────────────────────────────────┐
│ Kubernetes Cluster                                     │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Dapr Control Plane (dapr init -k)                │  │
│  │  ├── dapr-sidecar-injector (Mutating Webhook)    │  │
│  │  ├── dapr-operator (Manages Components & CRDs)   │  │
│  │  ├── dapr-sentry (Issues mTLS X.509 Certificates)│  │
│  │  └── dapr-placement (Actor state placement)      │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Pod: order-service-deployment                    │  │
│  │  ├── Container: order-service (NestJS :3000)     │  │
│  │  └── Container: daprd (Injected Sidecar :3500)   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 2.1 Initializing the Dapr Control Plane
```bash
# Initialize high-availability Dapr control plane on Kubernetes
dapr init -k --enable-ha=true
```

### 2.2 Kubernetes Deployment Manifest (with Annotations)
Adding `dapr.io/enabled: "true"` instructs the Dapr admission controller to inject the sidecar automatically:

```yaml
# k8s/order-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  labels:
    app: order-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
      annotations:
        # 1. Enable Dapr sidecar injection
        dapr.io/enabled: "true"
        # 2. Unique mesh discovery identifier
        dapr.io/app-id: "order-app"
        # 3. Port where NestJS application listens
        dapr.io/app-port: "3000"
        dapr.io/app-protocol: "http"
        dapr.io/enable-api-logging: "true"
        dapr.io/log-level: "info"
        dapr.io/config: "dapr-production-config"
        # 4. Resource limits for sidecar cgroup
        dapr.io/sidecar-cpu-limit: "500m"
        dapr.io/sidecar-memory-limit: "256Mi"
        dapr.io/sidecar-cpu-request: "100m"
        dapr.io/sidecar-memory-request: "128Mi"
    spec:
      containers:
        - name: order-service
          image: ghcr.io/mishraprayash/order-service:v1.2.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: DAPR_HOST
              value: "127.0.0.1" # In K8s, sidecar lives on local loopback!
            - name: DAPR_HTTP_PORT
              value: "3500"
          resources:
            limits:
              cpu: "1000m"
              memory: "512Mi"
            requests:
              cpu: "200m"
              memory: "256Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
```

### 🔍 Deep Dive: Kubernetes Annotation Breakdown
* **`dapr.io/enabled: "true"`**: When this pod spec is submitted to the Kubernetes API server, Dapr's Mutating Admission Webhook intercepts the request and injects the `daprd` container and volume mounts automatically.
* **`dapr.io/app-id: "order-app"`**: Registers this service in Dapr's internal service discovery registry. Any other service in the cluster can now invoke this service via `daprClient.invoker.invoke('order-app', ...)`.
* **`dapr.io/sidecar-cpu-limit` & `memory-limit`**: Prevents the sidecar from starving the Node.js V8 process during intense traffic surges.

### 2.3 Swapping Local Redis for Cloud Infrastructure
In production, we swap the local Redis YAML for enterprise infrastructure (e.g., **AWS ElastiCache Redis** or **Azure CosmosDB**) with Kubernetes Secret references:

```yaml
# k8s/components/production-statestore.yaml
apiVersion: dapr.io/v1alpha1
kind: Component
metadata:
  name: order-statestore
  namespace: production
spec:
  type: state.redis
  version: v1
  metadata:
    - name: redisHost
      value: "clustercfg.orders-cache.xxxxxx.use1.cache.amazonaws.com:6379"
    - name: redisPassword
      secretKeyRef:
        name: elasticache-secret
        key: auth-token
    - name: enableTLS
      value: "true"
```

---

## 3. Production Best Practices & Hardening

### 1. Health Checks & Sidecar Readiness
Always verify both your NestJS app and the Dapr sidecar are healthy before routing traffic. Dapr exposes native health endpoints:

```bash
# Check Dapr outbound readiness
curl -i http://127.0.0.1:3500/v1.0/healthz/outbound
# Returns 204 No Content when Dapr sidecar components (Redis, Kafka, Vault) are fully initialized
```

In your NestJS Terminus health check indicator:
```typescript
// src/health/dapr-health.indicator.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class DaprHealthIndicator extends HealthIndicator {
  constructor(private readonly http: HttpService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Verifies that the sidecar has connected to all declared components
      await this.http.axiosRef.get('http://127.0.0.1:3500/v1.0/healthz/outbound', {
        timeout: 2000,
      });
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Dapr sidecar outbound health check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
```

### 🔍 Why `/v1.0/healthz/outbound` is Critical
If your NestJS pod starts faster than Dapr can connect to AWS ElastiCache, incoming customer HTTP requests will fail with state store errors. By attaching `DaprHealthIndicator` to the Kubernetes Readiness Probe, Kubernetes will **hold traffic until the Dapr sidecar confirms that all database and broker connections are live**.

### 2. Zero-Trust Security: API Tokens & Mutual TLS
In Kubernetes, Dapr Sentry automatically encrypts inter-sidecar traffic with **mTLS**. To prevent unauthorized local processes from invoking Dapr, require an **API token**:

```yaml
# Pass Dapr API Token via Secret
annotations:
  dapr.io/api-token-secret: "dapr-api-token"
```

Configure `DaprClient` in NestJS to attach the header:
```typescript
new DaprClient({
  daprHost: '127.0.0.1',
  daprPort: '3500',
  daprApiToken: process.env.DAPR_API_TOKEN,
});
```

### 3. OpenTelemetry Distributed Tracing
Configure Dapr to stream W3C distributed traces to OpenTelemetry collectors (Grafana Tempo, Datadog, or Jaeger):

```yaml
# k8s/config/dapr-config.yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: dapr-production-config
  namespace: production
spec:
  tracing:
    samplingRate: "1" # 100% sample rate (tune to 0.1 for high-volume prod)
    zipkin:
      endpointAddress: "http://otel-collector.monitoring.svc.cluster.local:9411/api/v2/spans"
```

---

## 4. Full Series Wrap-Up & Production Checklist

Congratulations! You have transformed your NestJS backend into an enterprise-grade cloud-native microservices mesh.

### The Complete Production Architecture Checklist
* [x] **Separation of Concerns**: Zero cloud SDKs in Node.js application code; all infrastructure managed via Dapr components.
* [x] **Synchronous RPC**: Service Invocation with automatic name discovery, mTLS, and sidecar retry policies.
* [x] **Asynchronous Messaging**: Pub/Sub with CloudEvents envelopes and automatic distributed trace context propagation.
* [x] **State & Concurrency**: ETag-driven optimistic locking preventing dirty writes across pod replicas.
* [x] **Dynamic Configuration**: Subscribing to real-time config changes without pod redeployments.
* [x] **Local Development Parity**: Multi-container Docker Compose replicating exact Kubernetes networking.
* [x] **Kubernetes Deployment**: Automatic sidecar injection, health probes, and OpenTelemetry observability.

---

### Series Index
1. **[Part 1: Core Fundamentals & Architecture](/blog/nestjs-dapr-core-fundamentals-architecture)**
2. **[Part 2: NestJS Module & Service Invocation](/blog/nestjs-dapr-nestjs-integration-service-invocation)**
3. **[Part 3: State, Secrets, Config & Pub/Sub](/blog/nestjs-dapr-state-secrets-config-pubsub)**
4. **Part 4: Local Dev & Production Kubernetes (Current)**
