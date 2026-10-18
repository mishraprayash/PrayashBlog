---
title: "NestJS and Dapr: Local Development and Production Kubernetes"
headline: "Dapr from Compose to Kubernetes"
slug: "nestjs-dapr-local-dev-production-kubernetes"
description: "Running NestJS services with Dapr sidecars in Docker Compose and on Kubernetes: ports, health checks, API tokens and trace sampling."
publishDate: "2026-08-21T10:00:00Z"
author: "Prayash Mishra"
pillar: "running-services"
cover: "dapr-k8s"
tags: ["nestjs", "dapr", "kubernetes", "docker"]
series: "nestjs-dapr"
seriesPart: 4
draft: false
---

In **[Part 1](/blog/nestjs-dapr-core-fundamentals-architecture)**, **[Part 2](/blog/nestjs-dapr-nestjs-integration-service-invocation)**, and **[Part 3](/blog/nestjs-dapr-state-secrets-config-pubsub)** of this guide, we built a fully featured, event-driven NestJS microservices backend powered by Dapr.

Now comes the hard part: **How do we run this locally without pulling our hair out, and how do we harden it for enterprise Kubernetes production?**

Below is the full local-to-production path, including the parts that will bite you.

The diagram follows one service from Docker Compose to a hardened Kubernetes pod.

<div class="story" data-diagram="dapr-k8s">

1. **Compose: one namespace per app.** `network_mode: "service:order-service"` puts `order-dapr` in `order-service`'s network namespace, so the two share `127.0.0.1` the way containers in a pod do. `payment-dapr` joins `payment-service`'s namespace, so both sidecars can bind 3500 without colliding.
2. **Kubernetes: annotations and the injector.** You don't write the sidecar container yourself. With `dapr.io/enabled: "true"` on the pod template, Dapr's sidecar injector, a mutating admission webhook, adds the `daprd` container, configured from `dapr.io/app-id` and `dapr.io/app-port`.
3. **Readiness waits for the sidecar.** The readiness probe calls the app's `/health`, and the Dapr health indicator behind it calls the sidecar's `/v1.0/healthz/outbound`. That returns 204 only once the sidecar's components, such as the ElastiCache state store, are initialized, so Kubernetes holds traffic until then.
4. **mTLS and an API token.** Dapr Sentry issues the certificates the sidecars use for mTLS with each other. An API token, set with `dapr.io/api-token-secret`, stops other local processes from calling the sidecar, and the app sends it through `DaprClient`'s `daprApiToken`.

</div>

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
│  │ payment-service(:3001)│ ◄────► │ payment-dapr (:3500) │  │
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
# No top-level `version:` key — it is obsolete in Compose v2 and emits a warning.

services:
  # 1. Shared Infrastructure
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  zipkin:
    # Pin the tag. `:latest` means your local tracing backend can change under
    # you, and a Zipkin major bump has broken the v2 spans endpoint before.
    image: openzipkin/zipkin:3.4
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
      # Keep this identical to the Kubernetes manifest. The sidecar port is
      # per-network-namespace, so there is no reason for it to differ per
      # service — see the pitfall below.
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
      # Same as order-service. Uniform, so local matches prod.
      - DAPR_HTTP_PORT=3500
    depends_on:
      - redis

  payment-dapr:
    image: daprio/daprd:1.14.0
    command: [
      "./daprd",
      "-app-id", "payment-app",
      "-app-port", "3001",
      # Uniform 3500/50001. Safe because `network_mode` puts this sidecar in
      # payment-service's namespace, not order-service's.
      "-dapr-http-port", "3500",
      "-dapr-grpc-port", "50001",
      "-components-path", "/components",
      # Was missing here while order-dapr had it. A sidecar without -config
      # silently gets different tracing/sampling behaviour than its sibling.
      "-config", "/config/config.yaml"
    ]
    volumes:
      - "./components:/components"
      - "./config:/config"
    depends_on:
      - payment-service
    network_mode: "service:payment-service" # Shares network namespace with app container
```

### 🔍 Deep Dive: Why `network_mode: "service:..."` is Essential
* Notice `network_mode: "service:order-service"` on the `order-dapr` container.
* In standard Docker Compose, each container gets its own isolated network interface and IP address.
* By specifying `network_mode: "service:order-service"`, Docker attaches `order-dapr` directly to `order-service`'s Linux network namespace. Both containers share `127.0.0.1` (localhost), exactly mirroring how a multi-container Kubernetes Pod operates!

### ⚠️ Pitfall: One Port Per Namespace, Not Per Host

The instinct when you see `order-dapr` on 3500 is to move `payment-dapr` to 3501 "so they don't collide." There is no collision. `network_mode` puts each sidecar in **its own app's network namespace**, so both can bind 3500.

The cost of moving it is real and quiet. If `payment-service` reads `DAPR_HTTP_PORT=3501` locally but the Kubernetes manifest injects `DAPR_HTTP_PORT=3500`, then:

* the app works on every developer's machine,
* the app works in local Compose,
* the app 502s on the first pod it meets in staging, with a connection-refused
  on `127.0.0.1:3500` that points at nothing useful.

Nothing warns you. The value is just wrong in one environment. Pin sidecar ports to the defaults everywhere and let namespace isolation do what it exists to do.

**Symptom → cause → fix:** connection refused to `127.0.0.1:3500` in K8s but fine locally → the app is reading a port from a local-only env var → set the port from a single source (the injected `DAPR_HTTP_PORT`) and never hardcode a per-service variant.

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

### 3. Distributed Tracing

Dapr can export W3C trace context to several backends, but the exporter you
choose determines the whole `spec.tracing` block. Pick one and commit to it.

**Option A — Zipkin** (what the Compose stack above runs, and what the manifest
below configures). Spans go to Zipkin's v2 JSON endpoint:

```yaml
# k8s/config/dapr-config.yaml
apiVersion: dapr.io/v1alpha1
kind: Configuration
metadata:
  name: dapr-production-config
  namespace: production
spec:
  tracing:
    # NOT "1". Sampling every trace in production is how a tracing bill becomes
    # a tracing incident. Start here and tune against real span volume.
    samplingRate: "0.1"
    zipkin:
      endpointAddress: "http://zipkin.monitoring.svc.cluster.local:9411/api/v2/spans"
```

**Option B — OpenTelemetry Collector** (Grafana Tempo, Jaeger via OTel, Datadog
via OTel). This is a *different block*, not a different hostname in the one
above — the `zipkin:` key and the `otlp:` key are mutually exclusive, and
setting the wrong one produces an opaque export failure rather than a useful
error:

```yaml
spec:
  tracing:
    samplingRate: "0.1"
    otlp:
      endpointAddress: "http://otel-collector.monitoring.svc.cluster.local:4317"
      isSecure: false
      protocol: "grpc"
```

Pick A or B. Do not run Zipkin locally and point the production manifest at a
collector hostname, which is the mistake this section originally shipped.

### ⚠️ Pitfall: `samplingRate: "1"` in a Production Manifest

Shipping `samplingRate: "1"` because it is convenient locally is the single most expensive default in this file. At 100% sampling every sidecar retains and exports a span for every request, every publish, every state read, and every service invocation — including the health checks.

The failure is not immediate and not loud. What you get instead:

* Tracing storage cost grows linearly with traffic, with no ceiling.
* The sidecar's memory footprint grows, because it buffers spans for export.
* When the collector falls behind, the sidecar applies backpressure — and now
  your *application* is slow because tracing is slow.

There is no `samplingRate` value that is correct in the abstract. It depends on
your span volume, your retention window, and how many traces you actually read
during an incident. A reasonable starting point for a service mesh is `0.1`
(10%), and then: measure how many spans an incident actually needs, and set the
rate so that an incident fits inside your retention window.

One caveat that is easy to miss: head-based sampling means a trace is sampled
whole or not at all. If one very high-volume service dominates your span count
at 10%, the low-volume service you are trying to debug may be sampled too
sparsely to be useful. Tail-based sampling (sampling after the fact, in the
collector) solves this, at the cost of buffering — which is a collector-side
concern, not a Dapr one.

**Symptom → cause → fix:** sidecar memory climbing while throughput is flat →
100% trace sampling with a slow collector → lower `samplingRate`, and confirm
the collector is keeping up before raising it again.

---

## 4. Series Wrap-Up

That is the full local-to-production path. Before you call it done, walk this list yourself — it is a set of claims to verify, not achievements to tick off.

### What to verify before shipping

- [ ] **Separation of concerns holds.** No cloud SDK imports anywhere in application code; every cloud dependency lives in a Dapr component file. `grep -r "aws-sdk\|@azure/\|@google-cloud/" apps/ --include=*.ts` should return nothing outside infrastructure directories.
- [ ] **Service invocation retries are bounded.** Default Dapr retry policy has no cap. Confirm your `resiliency` config sets a max retry count and timeout, then verify a slow dependency actually trips it.
- [ ] **Pub/Sub consumers are idempotent.** The sidecar guarantees at-least-once delivery, so duplicates are expected, not exceptional. See [Idempotency in Distributed Systems](/blog/idempotency-in-distributed-systems) for the pattern and [the outbox post](/blog/transactional-outbox-pattern-production-realities) for the publisher half.
- [ ] **State writes actually carry an ETag.** The optimistic-locking path in [Part 3](/blog/nestjs-dapr-state-secrets-config-pubsub) only engages if you read the ETag off the sidecar's HTTP response header. A repository that reads the ETag from the SDK's return value silently runs last-write-wins. Assert on the conflict, not on the code.
- [ ] **Config subscriptions seed before they stream.** A subscription delivers changes, not current state. A pod that boots without an initial `get()` serves hardcoded defaults until someone edits the key.
- [ ] **Local and Kubernetes agree on ports.** Both must resolve `DAPR_HTTP_PORT` the same way. A per-service port that only exists in Compose fails at the first staging pod.
- [ ] **Tracing sample rate is deliberate.** `0.1` is a starting point, not a recommendation. Confirm it against your span volume and retention window, and confirm the collector keeps up.
- [ ] **Sidecars are pinned.** `daprio/daprd` and any tracing backend on `:latest` will change under you between a green deploy and a rollback.
- [ ] **Health probes bypass the sidecar.** Probe the app container directly. A probe routed through `daprd` reports the sidecar's health, not your service's.
