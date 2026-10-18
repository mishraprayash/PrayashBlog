---
title: "[TODO: project name]"
summary: "Event-driven backend services in NestJS, with PostgreSQL, a message broker and Dapr sidecars on Kubernetes. [TODO: one sentence on what it does for the people who use it.]"
role: "[TODO: your role, e.g. backend engineer on a team of four]"
period: "[TODO: e.g. 2026]"
status: "[TODO: e.g. in production]"
stack: ["NestJS", "TypeScript", "PostgreSQL", "Kafka", "Dapr", "Docker", "Kubernetes", "AWS S3"]
order: 1
links: []
posts:
  - "transactional-outbox-pattern-production-realities"
  - "idempotency-in-distributed-systems"
  - "message-queues-topics-event-streams-explained"
  - "scaling-event-dispatching-nestjs-strategy-pattern"
  - "direct-media-uploads-s3-presigned-urls-nestjs"
  - "nestjs-dapr-core-fundamentals-architecture"
---

Most of the posts on this site started as problems on this project. This page is the context they leave out: what the system was for, how it was put together, and what part of it was mine.

[TODO: confirm the stack listed above. It's inferred from the posts, so remove anything this project didn't use.]

## The problem

[TODO: two or three sentences. What does the system do, who relies on it, and what made it hard? For example: the volume, a reliability requirement, a team constraint, or a deadline.]

## How it fits together

[TODO: an architecture figure. Suggested contents: the services, their Dapr sidecars, PostgreSQL, the broker, the outbox relay, and where uploads go. A hand-drawn SVG or a cleaned-up photo of a whiteboard sketch both work; put it next to this file and reference it here.]

## What I did

[TODO: which parts you designed, which you built, which you reviewed, and who you worked with. Specific is better than impressive: "I wrote the outbox relay and its retry logic" beats "I led the event architecture".]

## Decisions that became posts

[TODO: remove any of these that didn't come from this project.]

- **Getting events out of the database reliably.** Why a polling relay loses events, and the Postgres problems that follow: [The Transactional Outbox Pattern](/blog/transactional-outbox-pattern-production-realities).
- **Making retries safe.** Keeping idempotency state in the same Postgres transaction as the business write: [Idempotency in Distributed Systems](/blog/idempotency-in-distributed-systems).
- **Choosing the transport.** Queues, topics and streams, and what each actually guarantees: [Message Queues, Topics, and Event Streams](/blog/message-queues-topics-event-streams-explained).
- **Notification dispatch.** A strategy registry and per-channel queues, so a slow webhook can't hold up a password reset: [Scaling Multi-Channel Event Dispatching](/blog/scaling-event-dispatching-nestjs-strategy-pattern).
- **Uploads.** Moving file bytes off the API servers with presigned S3 URLs: [Direct Media Uploads at Scale](/blog/direct-media-uploads-s3-presigned-urls-nestjs).
- **Sidecars.** Running the services behind Dapr: [NestJS microservices on Dapr](/series/nestjs-dapr).

## Results

[TODO: one or two outcomes you can stand behind, with numbers if you have them: latency, throughput, incidents, cost, time saved. If you don't have numbers, describe what changed in plain terms. Don't round up.]

## What I'd do differently

[TODO: one honest paragraph. This is often the most convincing part of a project page.]
