import type { Diagram } from "./types";

// Dapr part 4: Compose sidecars sharing the app's network namespace, then the
// Kubernetes injector, the outbound readiness check, and mTLS + API token.
export const daprK8s: Diagram = {
  label:
    "Diagram: in Docker Compose, order-dapr and payment-dapr each join their app's network namespace with network_mode service, so both bind 3500 on their own 127.0.0.1. On Kubernetes, the dapr.io annotations make the sidecar injector add a daprd container to the pod. The readiness probe hits the app's /health, which checks the sidecar's /v1.0/healthz/outbound, and that only returns 204 once components such as the ElastiCache state store are connected. Sidecars talk to each other over mTLS with certificates from dapr-sentry, and the app sends a dapr-api-token to its sidecar.",
  steps: 4,
  width: 520,
  height: 460,
  body: `
  <style>
    .dg-dapr-k8s .pod { fill: none; stroke: #5d5852; stroke-width: 1.5; stroke-dasharray: 3 5; }
    .dg-dapr-k8s .side { fill: #122019; }
    .dg-dapr-k8s .code { fill: #f4f0e7; }
    .dg-dapr-k8s .ns[data-hl-on] { stroke: #5fae86; stroke-dasharray: none; }
    .dg-dapr-k8s .hot[data-hl-on] { stroke: #5fae86; stroke-dasharray: none; }
  </style>

  <!-- main pair: order -->
  <text class="small" data-show="1" x="20" y="172">network_mode: service:order-service</text>
  <text class="small" data-show="2-" x="20" y="172">Pod: order-service</text>
  <rect class="pod ns" data-hl="1" x="20" y="180" width="480" height="110"/>
  <rect class="box" data-hl="3" x="36" y="198" width="170" height="74"/>
  <text class="title" x="52" y="228">order-service</text><text x="52" y="252">:3000</text>
  <rect class="box side" x="316" y="198" width="170" height="74"/>
  <rect class="box" data-hl="2-" x="316" y="198" width="170" height="74" style="fill:none"/>
  <text class="title" data-show="1" x="332" y="228">order-dapr</text>
  <text class="title" data-show="2-" x="332" y="228">daprd</text>
  <text data-show="1" x="332" y="252">:3500</text>
  <text data-show="2-" x="332" y="252">injected :3500</text>
  <path class="wire hot" data-hl="4" d="M206 235H316"/>
  <text class="small" data-show="1" x="222" y="226">127.0.0.1</text>
  <text class="small" data-show="4" x="214" y="226" style="fill:#86d1a8">api-token</text>

  <!-- step 1: compose -->
  <g data-show="1">
    <text class="small" x="20" y="22">docker compose</text>
    <rect class="box" x="20" y="40" width="200" height="66"/>
    <text class="title" x="36" y="68">Redis</text><text x="36" y="92">:6379</text>
    <rect class="box" x="300" y="40" width="200" height="66"/>
    <text class="title" x="316" y="68">Zipkin</text><text x="316" y="92">:9411</text>
    <path class="wire" d="M401 198V106M360 198V150H120V106"/>
    <text class="small" x="20" y="322">network_mode: service:payment-service</text>
    <rect class="pod ns" data-hl="1" x="20" y="330" width="480" height="110"/>
    <rect class="box" x="36" y="348" width="170" height="74"/>
    <text class="title" x="52" y="378">payment-service</text><text x="52" y="402">:3001</text>
    <rect class="box side" x="316" y="348" width="170" height="74"/>
    <text class="title" x="332" y="378">payment-dapr</text><text x="332" y="402">:3500</text>
    <path class="wire hot" data-hl="1" d="M206 385H316"/>
    <text class="small" x="222" y="376">127.0.0.1</text>
    <text class="tag" x="20" y="456" style="fill:#86d1a8">both bind 3500, each in its own namespace</text>
    <circle class="pkt" r="7"><animateMotion dur="1.8s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M206 235H316"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.8s" begin="-.6s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M206 385H316"/></circle>
  </g>

  <!-- steps 2-4: kubernetes control plane -->
  <g data-show="2-">
    <text class="small" x="20" y="22">Deployment template</text>
    <rect class="box" data-hl="2" x="20" y="30" width="290" height="116"/>
    <text class="title" x="36" y="56">annotations</text>
    <text class="code" x="36" y="82">dapr.io/enabled: "true"</text>
    <text class="code" x="36" y="104">dapr.io/app-id: "order-app"</text>
    <text class="code" x="36" y="126">dapr.io/app-port: "3000"</text>
    <text class="small" x="340" y="22">dapr-sidecar-injector</text>
    <rect class="box" data-hl="2" x="340" y="30" width="160" height="74"/>
    <text class="title" x="356" y="60">injector</text><text x="356" y="84">mutating webhook</text>
    <path class="wire" d="M310 67H340M420 104V198"/>
  </g>
  <g data-show="2">
    <circle class="pkt" r="7"><animateMotion dur="2s" repeatCount="indefinite" path="M420 104V198"/></circle>
  </g>

  <!-- step 3: readiness -->
  <g data-show="3">
    <rect class="box" data-hl="3" x="20" y="330" width="186" height="70"/>
    <text class="title" x="36" y="358">readinessProbe</text><text x="36" y="382">GET /health</text>
    <rect class="box" data-hl="3" x="316" y="350" width="184" height="70"/>
    <text class="title" x="332" y="378">state store</text><text x="332" y="402">ElastiCache</text>
    <path class="wire" d="M113 330V272M401 272V350"/>
    <text class="small" x="214" y="316">GET /v1.0/healthz/outbound</text>
    <text class="tag" x="316" y="440" style="fill:#86d1a8">204 once connected</text>
    <text class="tag" x="20" y="420" style="fill:#eea285">no traffic until then</text>
    <circle class="pkt" r="7"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.3;1" calcMode="linear" path="M113 330V272"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.3;.32;1" dur="3s" repeatCount="indefinite"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;.33;.6;1" calcMode="linear" path="M206 235H316"/><animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;.32;.34;.6;.62;1" dur="3s" repeatCount="indefinite"/></circle>
    <circle class="pkt" r="7" style="fill:#86d1a8"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;0;1" keyTimes="0;.63;1" calcMode="linear" path="M401 350V272"/><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.62;.64;1" dur="3s" repeatCount="indefinite"/></circle>
  </g>

  <!-- step 4: mTLS + API token -->
  <g data-show="4">
    <rect class="box" x="20" y="330" width="186" height="70"/>
    <text class="title" x="36" y="358">dapr-sentry</text><text x="36" y="382">X.509 certs</text>
    <rect class="box side" data-hl="4" x="316" y="366" width="184" height="66"/>
    <text class="title" x="332" y="392">daprd</text><text x="332" y="416">payment-app</text>
    <path class="wire" d="M206 352H401"/>
    <path class="wire hot" data-hl="4" d="M401 272V366"/>
    <text class="small" x="250" y="344">certs</text>
    <text class="small" x="410" y="322" style="fill:#86d1a8">mTLS</text>
    <circle class="pkt" r="7"><animateMotion dur="1.8s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M401 272V366"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="1.4s" repeatCount="indefinite" path="M206 235H316"/></circle>
  </g>
  `,
};
