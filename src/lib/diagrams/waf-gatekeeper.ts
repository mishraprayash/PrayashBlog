import type { Diagram } from "./types";

// Nginx ML WAF, part 1: TLS ends at Nginx, access_by_lua asks the sidecar, block or pass.
export const wafGatekeeper: Diagram = {
  label:
    "Diagram: a request enters Nginx, which terminates TLS and runs it through its phases. In the access phase a Lua gatekeeper posts a snapshot to a Python model sidecar; a malicious score returns 403, a safe one falls through to proxy_pass and the upstream app.",
  steps: 5,
  width: 520,
  height: 450,
  body: `
  <style>
    .dg-waf-gatekeeper .ph[data-hl-on] { fill: rgb(159 122 255 / .22); stroke: #b9a6dd; }
    .dg-waf-gatekeeper .ph-bad[data-hl-on] { fill: rgb(255 79 26 / .18); stroke: #e58870; }
    .dg-waf-gatekeeper .ph-ok[data-hl-on] { fill: rgb(0 184 116 / .18); stroke: #5fae86; }
    .dg-waf-gatekeeper .deny[data-hl-on] { stroke: #e58870; fill: #2a1610; }
    .dg-waf-gatekeeper .up[data-hl-on] { stroke: #5fae86; fill: #10241b; }
    .dg-waf-gatekeeper .cap { fill: #ffffff; }
  </style>
  <rect class="box" x="20" y="20" width="140" height="64"/><text class="title" x="36" y="48">Client</text><text x="36" y="72">HTTPS</text>

  <rect class="box" data-hl="1" x="20" y="120" width="300" height="230"/>
  <text class="title" x="36" y="148">Nginx / OpenResty</text>
  <rect class="row-r ph" data-hl="1" x="40" y="160" width="260" height="26"/><text x="56" y="178">post-read</text>
  <rect class="row-r" x="40" y="192" width="260" height="26"/><text x="56" y="210">rewrite</text>
  <rect class="row-r ph" data-hl="2-3" x="40" y="224" width="260" height="26"/>
  <rect class="row-r ph-bad" data-hl="4" x="40" y="224" width="260" height="26" style="fill:none"/>
  <text x="56" y="242">access_by_lua</text>
  <rect class="row-r ph-ok" data-hl="5" x="40" y="256" width="260" height="26"/><text x="56" y="274">content: proxy_pass</text>
  <rect class="row-r" x="40" y="288" width="260" height="26"/><text x="56" y="306">log</text>

  <rect class="box" x="360" y="200" width="140" height="90"/><text class="title" x="374" y="228">Sidecar</text><text x="374" y="252">PyTorch</text><text x="374" y="276">127.0.0.1:5000</text>
  <rect class="box deny" data-hl="4" x="360" y="370" width="140" height="66"/><text class="title" x="376" y="398">403</text><text x="376" y="422">Forbidden</text>
  <rect class="box up" data-hl="5" x="20" y="380" width="300" height="56"/><text class="title" x="36" y="404">Upstream app</text><text x="36" y="426">127.0.0.1:8080</text>

  <path class="wire" d="M140 84V104H270V120"/>
  <path class="wire" d="M300 237H360"/>
  <path class="wire" d="M320 330H430V370"/>
  <path class="wire" d="M270 350V380"/>

  <g data-show="1">
    <text class="cap" x="190" y="46">TLS ends at Nginx,</text>
    <text class="cap" x="190" y="70">so Lua sees plaintext</text>
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.7;1" calcMode="linear" path="M140 84V104H270V173"/></circle>
  </g>
  <g data-show="2-3">
    <rect class="row-r" x="336" y="110" width="166" height="74" style="stroke:#403c38"/>
    <text class="small" x="348" y="128">request snapshot</text>
    <text x="348" y="152">method uri query</text>
    <text x="348" y="174">headers, body</text>
  </g>
  <g data-show="2">
    <text class="cap" x="190" y="46">access_by_lua: body read,</text>
    <text class="cap" x="190" y="70">upstream not called yet</text>
    <circle class="pkt" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.7;1" calcMode="linear" path="M140 84V104H270V237"/></circle>
  </g>
  <g data-show="3">
    <text class="cap" x="190" y="46">POST /analyze, non-blocking</text>
    <text class="cap" x="190" y="70">50 ms connect, 100 ms read</text>
    <circle class="pkt" r="8"><animateMotion dur="1.8s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M300 237H360"/></circle>
    <text x="346" y="316">{malicious, score}</text>
  </g>
  <g data-show="4">
    <text class="cap" x="190" y="46">score ≥ 0.85: 403 at the edge</text>
    <text class="cap" x="190" y="70">the upstream never sees it</text>
    <circle class="pkt" r="8" style="fill:#e58870"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear" path="M140 84V104H270V237H310V330H430V370"/></circle>
  </g>
  <g data-show="5">
    <text class="cap" x="190" y="46">safe: falls through</text>
    <text class="cap" x="190" y="70">to proxy_pass</text>
    <circle class="pkt" r="8" style="fill:#86d1a8"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear" path="M140 84V104H270V408"/></circle>
    <text class="small" x="356" y="306">sidecar unreachable:</text>
    <text class="small" x="356" y="320">fails open, passes</text>
  </g>
  `,
};
