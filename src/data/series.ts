/**
 * Series titles and descriptions. Which posts belong to a series, and in what
 * order, is declared in each post's frontmatter (`series` + `seriesPart`) and
 * checked in src/lib/posts.ts, so renaming a post's slug can't silently drop
 * it from its series.
 */

export const SERIES = {
  "reliable-messaging": {
    title: "Reliable messaging, end to end",
    description:
      "What queues, topics and streams actually guarantee, how to get events into the broker without losing them, and how to survive receiving them twice.",
  },
  "nestjs-dapr": {
    title: "NestJS microservices on Dapr",
    description:
      "Running NestJS services behind Dapr sidecars: service invocation, state, secrets, config, pub/sub, and getting it all onto Kubernetes.",
  },
  "nginx-ml-waf": {
    title: "An ML request filter in front of Nginx",
    description:
      "Putting a model on the request path with OpenResty, then finding out how it breaks and how it gets bypassed.",
  },
  "docker-node": {
    title: "Docker images for Node services",
    description:
      "How images, layers and the build cache work, and how to get a Node service from a 1 GB image to a small, non-root one.",
  },
} as const;

export type SeriesId = keyof typeof SERIES;
export const SERIES_IDS = Object.keys(SERIES) as [SeriesId, ...SeriesId[]];
