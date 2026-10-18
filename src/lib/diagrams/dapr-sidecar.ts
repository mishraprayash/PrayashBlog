import type { Diagram } from "./types";

// Dapr part 1: the app talks to its sidecar on localhost, the sidecar talks to
// the building blocks, a broker swap is a YAML change, and the contrast with
// @nestjs/microservices, where the driver lives inside the app.
export const daprSidecar: Diagram = {
  label:
    "Diagram: a NestJS app and its daprd sidecar share a pod and talk over localhost on HTTP 3500 or gRPC 50001. The sidecar connects to state, pub/sub and secret components, a pub/sub swap from Redis to Kafka is a YAML change, and a @nestjs/microservices app instead holds the Kafka driver and retry logic in its own process.",
  steps: 4,
  width: 520,
  height: 450,
  body: `
  <style>
    .dg-dapr-sidecar .pod { fill: none; stroke: #55555c; stroke-width: 1.5; stroke-dasharray: 3 5; }
    .dg-dapr-sidecar .side { fill: #122019; }
    .dg-dapr-sidecar .app[data-hl-on] { stroke: #ff4f1a; }
    .dg-dapr-sidecar .local[data-hl-on] { stroke: #00b874; stroke-dasharray: none; }
  </style>
  <text class="small" x="20" y="22">pod / local process</text>
  <rect class="pod" x="20" y="30" width="480" height="122"/>
  <rect class="box" data-hl="1" x="36" y="56" width="170" height="74"/>
  <text class="title" x="52" y="86">NestJS app</text><text x="52" y="110">:3000</text>
  <text class="tag" data-show="3" x="52" y="146" style="fill:#4ade80">code unchanged</text>
  <rect class="box side" data-hl="1-2" x="316" y="56" width="170" height="74"/>
  <text class="title" x="332" y="86">daprd</text><text x="332" y="110">sidecar (Go)</text>
  <path class="wire local" data-hl="1" d="M206 93H316"/>
  <text class="small" x="222" y="84">HTTP 3500</text>
  <text class="small" x="222" y="112">gRPC 50001</text>
  <text class="small" x="222" y="144">localhost</text>

  <path class="wire" d="M401 130V200M90 200H430M90 200V262M260 200V262M430 200V262"/>
  <text class="small" x="100" y="232">components (YAML)</text>
  <rect class="box" data-hl="2" x="20" y="262" width="140" height="70"/>
  <text class="title" x="36" y="292">state</text><text x="36" y="316">Redis</text>
  <rect class="box" data-hl="2-3" x="190" y="262" width="140" height="70"/>
  <text class="title" x="206" y="292">pub/sub</text>
  <text data-show="-2" x="206" y="316">Redis</text>
  <text data-show="3-" x="206" y="316" style="fill:#f1eee6">Kafka</text>
  <rect class="box" data-hl="2" x="360" y="262" width="140" height="70"/>
  <text class="title" x="376" y="292">secrets</text><text x="376" y="316">Vault</text>

  <g data-show="1">
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M206 93H316"/></circle>
    <text class="small" x="36" y="182">/v1.0/state  /v1.0/publish  /v1.0/secrets</text>
  </g>
  <g data-show="2">
    <circle class="pkt" r="7"><animateMotion dur="2.4s" repeatCount="indefinite" path="M401 130V200H90V262"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="2.4s" begin=".4s" repeatCount="indefinite" path="M401 130V200H260V262"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="2.4s" begin=".8s" repeatCount="indefinite" path="M401 130V200H430V262"/></circle>
  </g>
  <g data-show="3">
    <text class="tag" x="190" y="352" style="fill:#4ade80">pubsub.yaml: redis to kafka</text>
  </g>

  <g data-show="4">
    <text class="small" x="20" y="374">without a sidecar</text>
    <rect class="box app" data-hl="4" x="20" y="382" width="330" height="62"/>
    <text class="title" x="36" y="406">@nestjs/microservices</text>
    <text x="36" y="430">Kafka driver + retry logic</text>
    <path class="wire" d="M350 413H400" style="stroke:#7a3420"/>
    <rect class="box" x="400" y="382" width="100" height="62"/>
    <text class="title" x="416" y="406">Kafka</text><text x="416" y="430">cluster</text>
    <circle class="pkt" r="7" style="fill:#ff4f1a"><animateMotion dur="1.6s" repeatCount="indefinite" path="M350 413H400"/></circle>
  </g>
  `,
};
