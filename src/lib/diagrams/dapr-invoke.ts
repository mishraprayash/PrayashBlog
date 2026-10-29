import type { Diagram } from "./types";

// Dapr part 2: OrderService invokes PaymentService by app id through both
// sidecars, then the resiliency policy (retries, circuit breaker) that the
// calling sidecar applies.
export const daprInvoke: Diagram = {
  label:
    "Diagram: OrderService calls its own daprd sidecar with the app id payment-app. That sidecar sends the call to PaymentService's sidecar over gRPC with mTLS, which forwards it to POST payments/process. When PaymentService fails, the calling sidecar retries with an exponential policy, and after five consecutive failures its circuit breaker opens and fails fast for 10 seconds.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-dapr-invoke .pod { fill: none; stroke: #5d5852; stroke-width: 1.5; stroke-dasharray: 3 5; }
    .dg-dapr-invoke .side { fill: #122019; }
    .dg-dapr-invoke .fail[data-hl-on] { stroke: #e58870; fill: #2a1610; }
    .dg-dapr-invoke .link[data-hl-on] { stroke: #e58870; stroke-dasharray: 2 8; }
    .dg-dapr-invoke .code { fill: #f4f0e7; white-space: pre; }
    .dg-dapr-invoke .pip { fill: #2b2824; transition: fill .3s; }
    .dg-dapr-invoke .pip[data-hl-on] { fill: #e58870; }
    .dg-dapr-invoke .pip:nth-of-type(2) { transition-delay: .15s; }
    .dg-dapr-invoke .pip:nth-of-type(3) { transition-delay: .3s; }
    .dg-dapr-invoke .pip:nth-of-type(4) { transition-delay: .45s; }
    .dg-dapr-invoke .pip:nth-of-type(5) { transition-delay: .6s; }
  </style>
  <text class="small" x="20" y="22">order-app</text>
  <rect class="pod" x="20" y="30" width="480" height="110"/>
  <rect class="box" data-hl="1" x="36" y="48" width="170" height="74"/>
  <text class="title" x="52" y="78">OrderService</text><text x="52" y="102">:3000</text>
  <rect class="box side" data-hl="1-2" x="316" y="48" width="170" height="74"/>
  <rect class="box" data-hl="4-" x="316" y="48" width="170" height="74" style="fill:none"/>
  <text class="title" x="332" y="78">daprd</text><text x="332" y="102">sidecar</text>
  <path class="wire" d="M206 85H316"/>

  <text class="small" x="20" y="302">payment-app</text>
  <rect class="pod" x="20" y="310" width="480" height="110"/>
  <rect class="box fail" data-hl="4-5" x="36" y="328" width="170" height="74"/>
  <text class="title" x="52" y="358">PaymentService</text><text x="52" y="382">:3001</text>
  <rect class="box side" data-hl="2-3" x="316" y="328" width="170" height="74"/>
  <text class="title" x="332" y="358">daprd</text><text x="332" y="382">sidecar</text>
  <path class="wire" d="M316 365H206"/>

  <path class="wire link" data-hl="5" d="M401 122V328"/>
  <text class="small" data-show="-4" x="410" y="230">gRPC + mTLS</text>
  <text class="tag" data-show="5" x="410" y="230" style="fill:#eea285">open: 10s</text>

  <g data-show="1">
    <text class="code" x="36" y="172">invoker.invoke(</text>
    <text class="code" x="36" y="194">  'payment-app',</text>
    <text class="code" x="36" y="216">  'payments/process',</text>
    <text class="code" x="36" y="238">  HttpMethod.POST, payload)</text>
    <text class="tag" x="36" y="266" style="fill:#86d1a8">an app id, no IP or hostname</text>
    <circle class="pkt" r="8"><animateMotion dur="1.6s" repeatCount="indefinite" path="M206 85H316"/></circle>
  </g>
  <g data-show="2">
    <text x="36" y="194">the sidecar finds</text>
    <text class="code" x="36" y="216">payment-app</text>
    <text x="36" y="238">and calls its sidecar</text>
    <circle class="pkt" r="8"><animateMotion dur="1.8s" repeatCount="indefinite" path="M401 122V328"/></circle>
  </g>
  <g data-show="3">
    <text class="code" x="36" y="194">POST /payments/process</text>
    <text x="36" y="216">reaches the controller,</text>
    <text x="36" y="238">and the reply goes back</text>
    <text class="tag" x="36" y="266" style="fill:#86d1a8">status: 'SUCCESS'</text>
    <circle class="pkt" r="8"><animateMotion dur="1.2s" repeatCount="indefinite" path="M316 365H206"/></circle>
    <circle class="pkt" r="7" style="fill:#86d1a8"><animateMotion dur="3s" repeatCount="indefinite" path="M206 365H401V85H206"/></circle>
  </g>
  <g data-show="4">
    <text class="title" x="36" y="180">paymentRetry</text>
    <text x="36" y="206">policy: exponential</text>
    <text x="36" y="228">maxRetries: 3</text>
    <text x="36" y="250">maxInterval: 3s</text>
    <text class="tag" x="36" y="276" style="fill:#86d1a8">the backoff runs in the sidecar</text>
    <circle class="pkt" r="8"><animateMotion dur="1.6s" repeatCount="indefinite" path="M401 122V365H206"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.9;1" dur="1.6s" repeatCount="indefinite"/></circle>
    <text x="214" y="356" style="font:900 22px var(--display);fill:#e58870">✕</text>
  </g>
  <g data-show="5">
    <text class="title" x="36" y="180">paymentCB</text>
    <text x="36" y="206">trip: consecutiveFailures &gt;= 5</text>
    <rect class="pip" data-hl="5" x="36" y="220" width="20" height="12"/>
    <rect class="pip" data-hl="5" x="62" y="220" width="20" height="12"/>
    <rect class="pip" data-hl="5" x="88" y="220" width="20" height="12"/>
    <rect class="pip" data-hl="5" x="114" y="220" width="20" height="12"/>
    <rect class="pip" data-hl="5" x="140" y="220" width="20" height="12"/>
    <text x="36" y="258">then fails fast, without</text>
    <text x="36" y="280">calling payment-app</text>
    <circle class="pkt" r="8" style="fill:#e58870"><animateMotion dur="1.6s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M206 85H316"/></circle>
  </g>
  `,
};
