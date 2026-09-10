export interface SeriesPost {
  part: number;
  title: string;
  slug: string;
}

export interface Series {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  posts: SeriesPost[];
}

export const seriesCatalog: Series[] = [
  {
    id: "distributed-systems",
    title: "Engineering Reliable Distributed Systems",
    shortTitle: "Distributed Systems",
    description: "A 3-part deep dive on transport mechanics, reliable event publishing with transactional outbox, and bulletproof consumer idempotency.",
    posts: [
      {
        part: 1,
        title: "Part 1: Messaging Patterns & Foundations (Queues, Pub/Sub, Streams)",
        slug: "message-queues-topics-event-streams-explained",
      },
      {
        part: 2,
        title: "Part 2: Reliable Publishing with the Transactional Outbox Pattern",
        slug: "transactional-outbox-pattern-production-realities",
      },
      {
        part: 3,
        title: "Part 3: Safe Consumption & Retries with Idempotency",
        slug: "idempotency-in-distributed-systems",
      },
    ],
  },
  {
    id: "nestjs-dapr",
    title: "Building Cloud-Native Microservices with NestJS and Dapr",
    shortTitle: "NestJS & Dapr",
    description: "A 4-part architectural blueprint for Dapr sidecars, service invocation, state/secrets/pubsub, and Kubernetes production.",
    posts: [
      {
        part: 1,
        title: "Part 1: Core Fundamentals & Architecture",
        slug: "nestjs-dapr-core-fundamentals-architecture",
      },
      {
        part: 2,
        title: "Part 2: NestJS Module & Service Invocation",
        slug: "nestjs-dapr-nestjs-integration-service-invocation",
      },
      {
        part: 3,
        title: "Part 3: State, Secrets, Config & Pub/Sub",
        slug: "nestjs-dapr-state-secrets-config-pubsub",
      },
      {
        part: 4,
        title: "Part 4: Local Dev & Production Kubernetes",
        slug: "nestjs-dapr-local-dev-production-kubernetes",
      },
    ],
  },
  {
    id: "nginx-ai-waf",
    title: "Building an AI-Powered WAF on Nginx",
    shortTitle: "Nginx AI WAF",
    description: "A 2-part deep dive on request-path ML inference, OpenResty cosockets, and production hardening.",
    posts: [
      {
        part: 1,
        title: "Part 1: The Architecture & Implementation",
        slug: "nginx-lua-ai-waf-gatekeeper",
      },
      {
        part: 2,
        title: "Part 2: Traps, Bypasses, and Hardening",
        slug: "nginx-lua-ai-waf-traps-bypasses",
      },
    ],
  },
  {
    id: "docker-mastery",
    title: "Docker Mastery: From Fundamentals to Multi-Stage Pipelines",
    shortTitle: "Docker Mastery",
    description: "A 2-part guide to container mechanics, single-stage best practices, multi-stage layer optimization, and kernel traps.",
    posts: [
      {
        part: 1,
        title: "Part 1: Docker Fundamentals – Container Mechanics & Single-Stage Best Practices",
        slug: "architecting-lightweight-docker-builds",
      },
      {
        part: 2,
        title: "Part 2: Docker Multi-Stage Builds – Layer Optimization & Image Size Reduction",
        slug: "docker-production-traps-edge-cases",
      },
    ],
  },
];

export function getSeriesForPost(slug: string): { series: Series; part: number; total: number } | undefined {
  for (const series of seriesCatalog) {
    const postIndex = series.posts.findIndex((p) => p.slug === slug);
    if (postIndex !== -1) {
      return {
        series,
        part: postIndex + 1,
        total: series.posts.length,
      };
    }
  }
  return undefined;
}
