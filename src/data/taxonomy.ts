/**
 * Pillars and the tag vocabulary. The content schema validates against these,
 * so an unknown pillar or tag fails the build instead of quietly creating a
 * one-post tag page. Add a tag here only once a second post will use it.
 */

export const PILLARS = {
  messaging: {
    title: "Messaging and delivery",
    short: "Messaging",
    description: "Queues, streams, the outbox, idempotency, retries and ordering.",
  },
  postgresql: {
    title: "PostgreSQL under real load",
    short: "PostgreSQL",
    description: "Locks, MVCC, vacuum, replication slots, and what the ORM hides.",
  },
  "running-services": {
    title: "Running services",
    short: "Running services",
    description: "Containers, Kubernetes, sidecars, probes and deploys.",
  },
  "network-edge": {
    title: "The network edge",
    short: "Network edge",
    description: "TLS, proxies, request-path security and uploads.",
  },
} as const;

export type PillarId = keyof typeof PILLARS;
export const PILLAR_IDS = Object.keys(PILLARS) as [PillarId, ...PillarId[]];

export const TAGS = [
  "aws",
  "dapr",
  "docker",
  "kafka",
  "kubernetes",
  "microservices",
  "nestjs",
  "nginx",
  "node",
  "postgresql",
  "queues",
  "security",
  "tls",
  "typescript",
] as const;

export type Tag = (typeof TAGS)[number];
