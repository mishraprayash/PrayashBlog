import type { Diagram } from "./types";

// Dapr part 3: a state read that carries the ETag in a header, two writers
// racing on one ETag, secrets, config seed-then-stream, and the two-step
// pub/sub handshake.
export const daprState: Diagram = {
  label:
    "Diagram: a NestJS app and its daprd sidecar, with a state store, secret store, config store and broker behind the sidecar. A state read returns the value in the body and the ETag in a header. Two writers save with the same ETag and only the first succeeds; the second gets a 409. Secrets are read through the sidecar, config is seeded with get and then streamed with subscribe, and for pub/sub the sidecar first asks the app for its subscriptions and then delivers events to the route it returned.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-dapr-state .pod { fill: none; stroke: #5d5852; stroke-width: 1.5; stroke-dasharray: 3 5; }
    .dg-dapr-state .side { fill: #122019; }
    .dg-dapr-state .code { fill: #f4f0e7; }
    .dg-dapr-state text { white-space: pre; }
    .dg-dapr-state .row-r[data-hl-on] { stroke: #5fae86; }
  </style>
  <text class="small" x="20" y="22">pod</text>
  <rect class="pod" x="20" y="30" width="480" height="110"/>
  <rect class="box" data-hl="1" x="36" y="48" width="170" height="74"/>
  <rect class="box" data-hl="4-5" x="36" y="48" width="170" height="74" style="fill:none"/>
  <text class="title" x="52" y="78">NestJS app</text><text x="52" y="102">DaprClient</text>
  <rect class="box side" x="316" y="48" width="170" height="74"/>
  <text class="title" x="332" y="78">daprd</text><text x="332" y="102">sidecar</text>
  <path class="wire" d="M206 85H316"/>
  <text class="small" x="222" y="76">localhost</text>

  <path class="wire" d="M332 122V398M332 194H350M332 262H350M332 330H350M332 398H350"/>
  <rect class="box" data-hl="1-2" x="350" y="168" width="150" height="52"/>
  <text class="title" x="364" y="190">state store</text><text x="364" y="211">Redis</text>
  <rect class="box" data-hl="3" x="350" y="236" width="150" height="52"/>
  <text class="title" x="364" y="258">secret store</text><text x="364" y="279">Vault</text>
  <rect class="box" data-hl="4" x="350" y="304" width="150" height="52"/>
  <text class="title" x="364" y="326">config store</text><text x="364" y="347">Redis</text>
  <rect class="box" data-hl="5" x="350" y="372" width="150" height="52"/>
  <text class="title" x="364" y="394">broker</text><text x="364" y="415">Kafka</text>

  <g data-show="1">
    <text class="code" x="36" y="180">GET /v1.0/state/</text>
    <text class="code" x="36" y="200">  order-statestore/order_1</text>
    <text x="36" y="234">body:   the order JSON</text>
    <text x="36" y="256">header: <tspan style="fill:#86d1a8">ETag e1</tspan></text>
    <text class="tag" x="36" y="290" style="fill:#eea285">state.get() returns the body only,</text>
    <text class="tag" x="36" y="306" style="fill:#eea285">so the ETag never reaches your code</text>
    <circle class="pkt" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M350 194H332V85H206"/></circle>
  </g>
  <g data-show="2">
    <rect class="row-r" data-hl="2" x="36" y="166" width="270" height="28"/>
    <text class="code" x="46" y="185">order_1   etag e1 → e2</text>
    <text x="36" y="226">A: save with etag e1</text>
    <text class="tag" x="250" y="226" style="fill:#86d1a8">ok</text>
    <text x="36" y="252">B: save with etag e1</text>
    <text class="tag" x="250" y="252" style="fill:#eea285">409</text>
    <text x="36" y="278" style="fill:#eea285">ConflictException</text>
    <text class="tag" x="36" y="310" style="fill:#86d1a8">concurrency: 'first-write'</text>
    <circle class="pkt" r="7" style="fill:#86d1a8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M332 122V194H350"/></circle>
    <circle class="pkt" r="7" style="fill:#e58870"><animateMotion dur="2.4s" begin="-.9s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M332 122V194H350"/></circle>
  </g>
  <g data-show="3">
    <text class="code" x="36" y="200">secret.get(</text>
    <text class="code" x="36" y="222">  'vault-secretstore', key)</text>
    <text class="tag" x="36" y="256" style="fill:#86d1a8">no Vault or AWS SDK in the app</text>
    <circle class="pkt" r="8"><animateMotion dur="2.2s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M332 122V262H350"/></circle>
  </g>
  <g data-show="4">
    <text class="code" x="36" y="180">1. configuration.get()</text>
    <text x="36" y="202">   seeds current values</text>
    <text class="code" x="36" y="234">2. configuration.subscribe()</text>
    <text x="36" y="256">   pushes changes only</text>
    <text class="tag" x="36" y="290" style="fill:#eea285">a severed stream raises no error</text>
    <text class="tag" x="36" y="306" style="fill:#eea285">at the call site</text>
    <circle class="pkt" r="8"><animateMotion dur="2.6s" repeatCount="indefinite" path="M350 330H332V85H206"/></circle>
  </g>
  <g data-show="5">
    <text class="code" x="36" y="180">1. GET /dapr/subscribe</text>
    <text x="36" y="202">   app returns topic + route</text>
    <text class="code" x="36" y="234">2. POST /events/orders/created</text>
    <text x="36" y="256">   200 acks the message</text>
    <text x="36" y="278">   RETRY or 500: retried</text>
    <circle class="pkt" r="8" style="fill:#b9a6dd"><animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.3;1" calcMode="linear" path="M316 85H206"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.3;.32;1" dur="4s" repeatCount="indefinite"/></circle>
    <circle class="pkt" r="8"><animateMotion dur="4s" repeatCount="indefinite" keyPoints="0;0;1" keyTimes="0;.4;1" calcMode="linear" path="M350 398H332V85H206"/><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.38;.4;1" dur="4s" repeatCount="indefinite"/></circle>
  </g>
  `,
};
