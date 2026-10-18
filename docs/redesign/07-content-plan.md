# Phase 7: Content quality

**Where things are:**
- **Editorial standard:** `docs/blog-writing-guide.md` (rewritten).
- **Post template:** `docs/post-template.md`.
- **The two strongest posts, rewritten in full as examples:**
  - [The Transactional Outbox Pattern](../../src/content/blog/transactional-outbox-pattern-production-realities.md). Every failure in it is reproduced on Postgres 16, three of them new to the post.
  - [Idempotency in Distributed Systems](../../src/content/blog/idempotency-in-distributed-systems.md). Concurrency behaviour corrected and shown from a test run; the external-API section reworked around a lease.

Both rewrites keep your structure, examples and claims, except where a claim turned out to be wrong. Facts only you have are `[TODO: …]`.

---

## Plans for every other post

Each plan lists, in priority order, what to **fix** (wrong or unverified), **add**, **cut**, **restructure** and **retitle**. Titles can change freely; slugs can't. "Verify" means run it and show the output before republishing.

### Messaging and delivery

**Message Queues, Topics, and Event Streams** (`message-queues-topics-event-streams-explained`)
- **Fix:** the "✅" consumer snippet has the same crash hole the Outbox post had. A crash after the claim leaves it stuck, and a DB error after a successful charge deletes the claim and charges again. Replace it with the lease version and the provider key, and link Idempotency Pattern 3.
- **Fix:** add a Kafka ordering nuance. With `enable.idempotence` (the default since Kafka 3.0), producer retries don't reorder within a partition; without it, and with `max.in.flight.requests.per.connection > 1`, they can. Cite KIP-679.
- **Cut:**
  - The bold-heavy definitions (72 bold spans).
  - The "If you take one thing from this series" closer.
  - The manual "Series Navigation" section, which the page now renders.
- **Restructure:** move the orphaned "Throughput Buffering" bullet into section 1.
- **Retitle:** "Queues, Topics and Streams: What Each One Actually Guarantees".

**Scaling Multi-Channel Event Dispatching in NestJS** (`scaling-event-dispatching-nestjs-strategy-pattern`)
- **Fix:** the registry injects every strategy in its constructor, so adding a channel still edits it, which contradicts the open/closed claim. Use a multi-provider token, or `DiscoveryService` with a `@NotificationChannel()` decorator, and show adding a channel without touching the registry.
- **Fix:** BullMQ `jobId` deduplicates *enqueues*. A retry of the same job reuses the same id, so it doesn't stop the duplicate SMS described. Use the provider's idempotency key or an outbound log, and link Idempotency. BullMQ's default `attempts` is 1, not 5.
- **Fix:** the HMAC signs `JSON.stringify(body)` while axios serialises again. Sign and send the same bytes. The signed string `t=…,v1=…` mixes header format into the payload, so use `${timestamp}.${body}`.
- **Add:** `UserVerifiedDataDto` has no transformer, so PII redaction never runs for it. Either show redaction or drop the claim.
- **Cut:** "elegant", the 15-dependency hyperbole, and "Here is how I architected our…". Replace it with one true sentence of context. `[TODO]`
- **Retitle:** "Notification Dispatch in NestJS Without the Giant Switch".

### Running services

**Docker Fundamentals** (`architecting-lightweight-docker-builds`)
- **Restructure:** this is introductory material, which your guide rules out. Merge the useful parts (cache ordering, `.dockerignore`, exec-form `CMD`) into Part 2 as a short "before you start" section, and turn this post into a redirect target or drop it from the series. Keep the URL live.
- **Fix:** "If an attacker escapes… they gain root access to the host" overstates it. Root in the container is not root on the host without a separate escape. Say what non-root actually prevents.
- **Verify:** whether `CMD node server.js` on `node:20-slim` really swallows SIGTERM. Debian's `dash` may `exec` the final command, in which case it doesn't. Show `docker stop` timing both ways.

**Docker Multi-Stage Builds** (`docker-production-traps-edge-cases`)
- **Fix:** the size table (1,240 / 420 / 142 MB) and "25 s → 3 s pull" need a method or a `[TODO]`. The post also says 130, 140 and 142 MB in different places.
- **Fix:** the Kubernetes grace period is 30 s by default. 10 s is `docker stop`.
- **Verify or cut:** the musl 128 KB thread-stack SIGSEGV claim. Node and libuv set their own thread stack sizes. Show a crash or drop it.
- **Fix:** whiteouts in image layers are `.wh.` files in the OCI tarball; the `0:0` character device is the overlayfs on-disk form. Say which you mean.
- **Retitle:** "Shrinking a Node.js Docker Image: Multi-Stage Builds and What Still Bites".

**NestJS and Dapr: Core Fundamentals** (`nestjs-dapr-core-fundamentals-architecture`)
- **Restructure:** it reads as a docs summary. Cut it to a short "why we tried Dapr" opener in your words `[TODO]`, plus one honest trade-off table. "Completely decoupled" and "Universal" become what actually changes when you swap a broker: ordering, partition keys, metadata, bulk.
- **Add:** measured sidecar overhead (latency per hop, memory per pod) from your project `[TODO]`, or remove "sub-millisecond".

**NestJS and Dapr: Module and Service Invocation** (`nestjs-dapr-nestjs-integration-service-invocation`)
- **Fix:** heading numbers (§2 contains 1.1/1.2; §4 contains 3.2/3.3).
- **Fix:** app ids (`pay-app` vs `payment-app`), ports (3501 here, 3500 in Part 4) and paths (`libs/dapr` vs `./dapr`) disagree.
- **Fix:** `DaprServer` is created on port 3000, the port Nest listens on, and never started. Remove it; Part 3 uses Nest controllers for subscriptions anyway.
- **Fix:** the resiliency policy retries `POST payments/process` with no idempotency key. That's a double-charge recipe, so link Idempotency and show the key.
- **Cut:** the "Pitfall: useClass…" section is about an earlier draft of the post's own code.

**NestJS and Dapr: State, Secrets, Config, Pub/Sub** (`nestjs-dapr-state-secrets-config-pubsub`)
- **Fix:** it imports `DAPR_HTTP_URL` / `DAPR_API_TOKEN` from a module that doesn't define them. Add them to the Part 2 module.
- **Verify:** the JS SDK's configuration `subscribe` signature (the SDK has `subscribeWithKeys`, which returns a stream with `stop()`), and "sidecars cache secrets with configurable TTLs" (likely false).
- **Fix:** the "fail loudly" comment sits above code that logs and continues. Make one match the other.
- **Add:** publishing after a state write is a dual write, so link the Outbox post. The subscriber is at-least-once, so link Idempotency.

**NestJS and Dapr: Local Dev and Kubernetes** (`nestjs-dapr-local-dev-production-kubernetes`)
- **Fix:** `-components-path` is deprecated in favour of `--resources-path` (Dapr 1.11+), and the post pins 1.14.
- **Fix:** it gates readiness on `/v1.0/healthz/outbound`, then the checklist says "probes bypass the sidecar". Pick one. Separately, using the same `/health` for liveness and readiness means a Redis outage restarts every pod. Split them.
- **Verify:** "the sidecar applies backpressure when the collector is slow" (OTel exporters usually drop instead) and "default Dapr retry policy has no cap".
- **Cut:** "which is the mistake this section originally shipped".

**Production Kubernetes Debugging with k9s** (`mastering-k9s-kubernetes-terminal-ui-guide`)
- **Fix:** the ephemeral-container pitfall. `capabilities`, `readOnlyRootFilesystem` and `allowPrivilegeEscalation` are container-level fields and aren't inherited. What blocks netshoot is pod-level `runAsNonRoot` or Pod Security Admission. Show `kubectl debug --profile=netadmin` / `restricted`.
- **Fix:** `--target=$NAME` in the plugin passes the pod name where a container name is expected.
- **Verify:** `K9S_SKIN`.
- **Restructure:** cut the hotkey cheatsheet and cloud-login steps, which are documented elsewhere. Keep per-cluster skins, read-only plus RBAC, and the debug-container story, and lead with an incident from your project if there was one `[TODO]`.
- **Retitle:** "Making k9s Safe to Use on Production Clusters".

### The network edge

**TLS in Node.js** (`demystifying-ssl-tls-node-https`). The chain section was corrected in October.
- **Add:** measured handshake cost. Use `openssl s_time` or autocannon against `https.createServer` on Node 22 with P-256 vs RSA-2048, and show event-loop delay (`perf_hooks.monitorEventLoopDelay`) under a handshake burst. That turns the "event-loop stall" claim into evidence.
- **Link:** the WAF posts, where TLS terminates at Nginx instead.

**AI-Powered WAF: Architecture** (`nginx-lua-ai-waf-gatekeeper`)
- **Add:** the number the whole design hinges on, inference latency per request (p50/p99) on your hardware, against the 100 ms read timeout `[TODO]`.
- **Fix:** Part 1 runs the sidecar on Werkzeug, so call that out where it's introduced (done in a comment). Show the gunicorn command instead.

**AI-Powered WAF: Traps, Bypasses, and Hardening** (`nginx-lua-ai-waf-traps-bypasses`). The socket section and buffer default were corrected in October.
- **Fix:** the `io.open` pitfall overstates it. A 20 KB file nginx just wrote is almost certainly in the page cache, and the read takes microseconds. Keep the advice and drop the "worker-scoped denial of service" framing, or measure it.
- **Fix:** "read them asynchronously via `ngx.location.capture`" and "shared memory with `ngx.on_abort`-aware coroutines" are vague. Show working code or cut them.
- **Cut:** reviewer residue ("you did it in the section labelled 'the fix'", "says this; it needs to be said here").
- **Add:** an evaluation of the 0.85 threshold (labelled set, false-positive rate) `[TODO]`.

**Direct Media Uploads with S3 Presigned URLs** (`direct-media-uploads-s3-presigned-urls-nestjs`)
- **Verify, highest priority:** the recommended "bucket policy with `s3:content-length-range`". As far as I know that condition key exists only in POST policies, not bucket policies. If so, the recommended fix doesn't exist, and the answer is POST policies or a post-upload size check with `HeadObject`.
- **Verify:** "signing `content-length` breaks every browser upload". With a `File` body the browser sends an exact `Content-Length`. Test in Chromium against S3 or MinIO.
- **Fix:** `confirm-upload` accepts any key. Check it starts with `uploads/${userId}/` (IDOR).
- **Fix:** static credentials from env vars; use the default credential chain (IRSA on EKS).
- **Cut:** "The original version of this service…".

---

## Ten new post ideas

Each fits a pillar. Most are things the existing posts touch without going into.

| # | Working title | Pillar | Angle |
|---|---|---|---|
| 1 | **The transaction that stopped vacuum** | PostgreSQL | One `idle in transaction` session, every table bloating, and how to find it in `pg_stat_activity` before the disk does. |
| 2 | **`lock_timeout`, `statement_timeout` and the queue behind your migration** | PostgreSQL | Why a one-line `ALTER TABLE` stalls every query (the lock queue), reproduced, and the timeouts that make it fail fast instead. |
| 3 | **How many connections does your Node service actually need?** | PostgreSQL | Pool sizing from first principles: `max_connections`, PgBouncer transaction mode, and what breaks (prepared statements, `SET`, advisory locks). |
| 4 | **Retries that don't make the outage worse** | Messaging | Backoff with jitter, retry budgets, and why three layers each retrying three times means 27 requests. Measured with a toy service. |
| 5 | **Poison messages: what to do with the event you can't process** | Messaging | DLQs that someone actually reads, parking lots vs. retry topics, and replaying safely. |
| 6 | **Kafka consumer rebalances, measured** | Messaging | What a deploy does to consumption lag under eager vs. cooperative rebalancing, with numbers. |
| 7 | **Graceful shutdown, end to end** | Running services | SIGTERM → readiness → draining → Kafka commit → exit, across Node, Docker and Kubernetes, with the timings that have to line up. |
| 8 | **Liveness probes that restart healthy pods** | Running services | Why a dependency check in liveness turns a Redis blip into a full restart, and what each probe should actually check. |
| 9 | **Timeouts across a proxy chain** | Network edge | Client → Nginx → Node → Postgres: which timeout fires first, what the client sees, and how to make them nest. |
| 10 | **HTTP keep-alive between your own services** | Network edge | From the WAF sidecar bug: `Connection: close`, idle timeouts that race, and the `ECONNRESET` you get when they're set the wrong way round. |

Ideas 1, 2 and 3 would give the PostgreSQL pillar its own posts, which it currently lacks.
