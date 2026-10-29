import type { Diagram } from "./types";

// k9s: a local binary that reads kubeconfig contexts and talks to each
// cluster's API server; per-cluster skins and read-only mode; the triage
// keys; and the debug container a hardened pod refuses.
export const k9s: Diagram = {
  label:
    "Diagram: k9s on your machine reads contexts from ~/.kube/config and talks to the chosen cluster's API server. Switching to the production context turns the skin red, read-only mode blocks delete in the UI, and a crashing pod is triaged with previous logs, a shell and port-forward, while a netshoot debug container is refused by the pod's securityContext.",
  steps: 5,
  width: 520,
  height: 450,
  body: `
  <style>
    .dg-k9s .k9[data-hl-on] { stroke: #e47c75; fill: #1a0000; }
    .dg-k9s .on-local[data-hl-on] { fill: rgb(0 184 116 / .2); stroke: #5fae86; }
    .dg-k9s .on-prod[data-hl-on] { fill: rgb(255 85 85 / .18); stroke: #e47c75; }
    .dg-k9s .hot { fill: #eea285; }
    .dg-k9s .cool { fill: #86d1a8; }
    .dg-k9s .key { fill: #ffffff; }
    .dg-k9s .chip { fill: #2b2824; }
    .dg-k9s .eph { fill: #2a1610; stroke: #e58870; stroke-width: 1.5; stroke-dasharray: 5 4; }
  </style>

  <!-- Your machine -->
  <rect class="box k9" data-hl="2-5" x="20" y="20" width="190" height="70"/>
  <text class="title" x="36" y="48">k9s</text><text x="36" y="74">local binary</text>
  <text class="tag" data-show="2-" x="92" y="47" style="fill:#e47c75">skin: prod-alert</text>

  <rect class="box" x="20" y="110" width="190" height="150"/>
  <text class="title" x="36" y="136">~/.kube/config</text>
  <rect class="row-r on-local" data-hl="1" x="32" y="148" width="166" height="22"/><text x="42" y="164">k3d-local</text>
  <rect class="row-r on-prod" data-hl="2-" x="32" y="174" width="166" height="22"/><text x="42" y="190">eks-prod</text>
  <rect class="row-r" x="32" y="200" width="166" height="22"/><text x="42" y="216">aks-prod</text>
  <rect class="row-r" x="32" y="226" width="166" height="22"/><text x="42" y="242">gke-prod</text>
  <path class="wire" d="M115 90V110"/>

  <!-- API servers -->
  <text class="small" x="300" y="40">API servers</text>
  <rect class="box on-local" data-hl="1" x="300" y="52" width="200" height="40"/><text x="316" y="77">k3d-local</text>
  <rect class="box on-prod" data-hl="2-" x="300" y="100" width="200" height="40"/><text x="316" y="125">eks-prod</text>
  <rect class="box" x="300" y="148" width="200" height="40"/><text x="316" y="173">aks-prod</text>
  <rect class="box" x="300" y="196" width="200" height="40"/><text x="316" y="221">gke-prod</text>
  <text class="tag cool" data-show="3" x="440" y="124">RBAC</text>

  <g data-show="1">
    <path class="wire" d="M210 55H255V72H300"/>
    <circle class="pkt" r="6"><animateMotion dur="1.8s" repeatCount="indefinite" path="M210 55H255V72H300"/></circle>
    <text class="small" x="218" y="110">TLS</text>
    <text x="20" y="300">Nothing is installed in the cluster.</text>
    <text x="20" y="326">k9s uses the context and token from</text>
    <text x="20" y="348">kubeconfig, so any cluster kubectl</text>
    <text x="20" y="370">can reach works the same way.</text>
  </g>

  <g data-show="2-5">
    <path class="wire" d="M210 55H255V120H300" style="stroke:#7a2a2a"/>
  </g>
  <g data-show="2">
    <circle class="pkt" r="6" style="fill:#e47c75"><animateMotion dur="1.8s" repeatCount="indefinite" path="M210 55H255V120H300"/></circle>
    <text class="key" x="20" y="300">:ctx</text><text x="70" y="300">k3d-local → eks-prod</text>
    <text x="20" y="332">The production context loads its own</text>
    <text x="20" y="354">config.yaml, with skin: prod-alert,</text>
    <text x="20" y="376">so the whole screen turns red.</text>
    <text class="small" x="20" y="404">a skin is a signal, not a control</text>
  </g>

  <g data-show="3">
    <circle class="pkt" r="6" style="fill:#e58870"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.6;1" calcMode="linear" path="M210 55H240"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.58;.64;1" dur="2s" repeatCount="indefinite"/></circle>
    <text x="236" y="40" style="font:900 20px var(--display);fill:#e58870">✕</text>
    <text class="key" x="20" y="300">k9s --readonly</text>
    <text x="20" y="326">Ctrl+D (delete) and e (edit) are off.</text>
    <text x="20" y="358">That stops the UI only. A kubectl in</text>
    <text x="20" y="380">another terminal still works, so the</text>
    <text x="20" y="402">real control is RBAC on the context.</text>
  </g>

  <!-- Triage on one pod -->
  <g data-show="4-5">
    <rect class="box" x="20" y="280" width="480" height="160"/>
    <text class="title" x="36" y="306">order-service pod</text>
    <text class="tag hot" x="200" y="305">CrashLoopBackOff</text>
  </g>
  <g data-show="4">
    <text class="key" x="36" y="338">l</text><text x="120" y="338">logs: it just restarted</text>
    <rect class="row-r" x="30" y="348" width="460" height="24" style="fill:rgb(0 184 116 / .18)"/>
    <text class="key" x="36" y="365">p</text><text class="cool" x="120" y="365">previous logs: the crash</text>
    <text class="key" x="36" y="394">s</text><text x="120" y="394">shell in the container</text>
    <text class="key" x="36" y="422">Shift+F</text><text x="120" y="422">port-forward (:pf)</text>
  </g>
  <g data-show="5">
    <rect class="chip" x="36" y="324" width="70" height="30"/><text x="46" y="344">app</text>
    <rect class="eph" x="36" y="368" width="110" height="30"/><text x="46" y="388" style="fill:#eea285">netshoot</text>
    <text x="156" y="392" style="font:900 20px var(--display);fill:#e58870">✕</text>
    <text class="small" x="36" y="424">Shift+D: kubectl debug</text>
    <text class="small" x="250" y="330">securityContext</text>
    <text x="250" y="352">drop: ["ALL"]</text>
    <text x="250" y="374">readOnlyRootFilesystem</text>
    <text class="hot" x="250" y="402">needs NET_ADMIN,</text>
    <text class="hot" x="250" y="424">NET_RAW: refused</text>
  </g>
  `,
};
