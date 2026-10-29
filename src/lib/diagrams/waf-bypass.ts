import type { Diagram } from "./types";

// Nginx ML WAF, part 2: the disk spill, token truncation, socket churn, the breaker, encodings.
export const wafBypass: Diagram = {
  label:
    "Diagram: a client, Nginx with a Lua gatekeeper, a model sidecar and a backend. It shows a large body spilling to disk and going unscored, the 512-token cut, sockets piling up in TIME_WAIT, a circuit breaker held open by five slow requests, and encoded payloads the model never sees decoded.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-waf-bypass .be[data-hl-on] { stroke: #e58870; fill: #2a1610; }
    .dg-waf-bypass .be2 { fill: none; stroke: transparent; }
    .dg-waf-bypass .be2[data-hl-on] { stroke: #e58870; }
    .dg-waf-bypass .sc[data-hl-on] { stroke: #eea285; }
    .dg-waf-bypass .bad { fill: #eea285; }
    .dg-waf-bypass .ok { fill: #86d1a8; }
    .dg-waf-bypass .spill { fill: #2a1610; stroke: #e58870; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .dg-waf-bypass .fillbar { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); transition: transform 1s cubic-bezier(.2,.8,.2,1); }
    .dg-waf-bypass .fillbar[data-hl-on] { transform: none; }
    .dg-waf-bypass .tw { fill: #2b2824; stroke: #eea285; stroke-width: 1; }
    .dg-waf-bypass .cut { stroke: #e58870; stroke-width: 2; stroke-dasharray: 4 3; }
  </style>
  <rect class="box" x="20" y="20" width="110" height="64"/><text class="title" x="34" y="48">Client</text><text x="34" y="72">attacker</text>
  <rect class="box" x="160" y="20" width="160" height="64"/><text class="title" x="174" y="48">Nginx + Lua</text><text x="174" y="72">gatekeeper</text>
  <rect class="box sc" data-hl="3-4" x="380" y="20" width="120" height="64"/><text class="title" x="394" y="48">Sidecar</text><text x="394" y="72">:5000</text>
  <rect class="box be" data-hl="1" x="160" y="130" width="160" height="50"/><rect class="box be2" data-hl="4" x="160" y="130" width="160" height="50"/><text class="title" x="174" y="161">Backend</text>
  <path class="wire" d="M130 52H160"/><path class="wire" d="M320 52H380"/><path class="wire" d="M240 84V130"/>

  <g data-show="1">
    <text x="20" y="214">20 KB body</text>
    <rect x="20" y="226" width="200" height="34" fill="#2b2824"/><rect class="fillbar" data-hl="1" x="20" y="226" width="200" height="34" fill="rgb(159 122 255 / .45)"/>
    <text x="32" y="248">buffer: 8 KB</text>
    <rect class="spill" x="240" y="226" width="260" height="34"/><text x="252" y="248" style="fill:#eea285">rest: temp file on disk</text>
    <text class="bad" x="20" y="300">get_body_data() returns nil</text>
    <text x="20" y="328">body = "": scored safe</text>
    <text class="bad" x="20" y="356">the payload reaches the backend</text>
    <circle class="pkt" r="8" style="fill:#e58870"><animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear" path="M130 52H160M240 84V130"/></circle>
  </g>

  <g data-show="2">
    <text class="ok" x="20" y="214">buffer ≥ max body size: no spill</text>
    <text x="20" y="252">the sidecar tokenizes with max_length=512</text>
    <rect class="row-r" x="20" y="272" width="300" height="34"/><text x="32" y="294">GET /uri · padding…</text>
    <rect class="spill" x="320" y="272" width="180" height="34"/><text x="332" y="294" style="fill:#eea285">payload</text>
    <path class="cut" d="M320 262V318"/>
    <text class="tag" x="250" y="334" style="fill:#eea285">512 tokens</text>
    <text class="bad" x="20" y="368">cut before the model sees it</text>
    <text class="small" x="20" y="400">fix: score overlapping 512-token windows, block on the highest</text>
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear" path="M130 52H160M320 52H380"/></circle>
  </g>

  <g data-show="3">
    <text class="bad" x="20" y="214">sidecar replies Connection: close</text>
    <text x="20" y="242">a new TCP connection per inspection</text>
    <g>
      <rect class="tw" x="20" y="258" width="104" height="26"/><text class="tag" x="32" y="275">TIME_WAIT</text>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.1;.12;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="134" y="258" width="104" height="26"/><text class="tag" x="146" y="275">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.2;.22;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="248" y="258" width="104" height="26"/><text class="tag" x="260" y="275">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.3;.32;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="362" y="258" width="104" height="26"/><text class="tag" x="374" y="275">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.4;.42;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="20" y="292" width="104" height="26"/><text class="tag" x="32" y="309">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.5;.52;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="134" y="292" width="104" height="26"/><text class="tag" x="146" y="309">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.6;.62;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="248" y="292" width="104" height="26"/><text class="tag" x="260" y="309">TIME_WAIT</text></g>
      <g><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.7;.72;1" dur="4s" repeatCount="indefinite"/><rect class="tw" x="362" y="292" width="104" height="26"/><text class="tag" x="374" y="309">TIME_WAIT</text></g>
    </g>
    <text class="bad" x="20" y="352">connect(): cannot assign requested address</text>
    <text class="small" x="20" y="390">fix: a keep-alive server (gunicorn gthread), keepalive_pool above 30</text>
    <circle class="pkt" r="7"><animateMotion dur=".8s" repeatCount="indefinite" path="M320 52H380"/></circle>
    <circle class="pkt" r="7"><animateMotion dur=".8s" begin="-.4s" repeatCount="indefinite" path="M320 52H380"/></circle>
  </g>

  <g data-show="4">
    <text x="20" y="214">5 slow requests, 5 timeouts</text>
    <rect class="tw" x="20" y="228" width="44" height="28"/><text x="36" y="248" class="bad">✕</text>
    <rect class="tw" x="72" y="228" width="44" height="28"/><text x="88" y="248" class="bad">✕</text>
    <rect class="tw" x="124" y="228" width="44" height="28"/><text x="140" y="248" class="bad">✕</text>
    <rect class="tw" x="176" y="228" width="44" height="28"/><text x="192" y="248" class="bad">✕</text>
    <rect class="tw" x="228" y="228" width="44" height="28"/><text x="244" y="248" class="bad">✕</text>
    <text x="20" y="296">breaker tripped: open for 30 s</text>
    <g transform="translate(20 308)">
      <rect width="480" height="16" fill="#2b2824"/>
      <rect width="480" height="16" fill="#e58870"><animateTransform attributeName="transform" type="scale" values="1 1;0 1" dur="5s" repeatCount="indefinite"/></rect>
    </g>
    <text class="bad" x="20" y="358">every request passes uninspected</text>
    <text class="small" x="20" y="390">then the attacker sends 5 more and repeats</text>
    <circle class="pkt" r="8" style="fill:#e58870"><animateMotion dur="1.6s" repeatCount="indefinite" path="M130 52H160M240 84V130"/></circle>
  </g>

  <g data-show="5">
    <rect class="row-r" x="20" y="208" width="120" height="32"/><text x="34" y="229">%2527</text>
    <rect class="row-r" x="200" y="208" width="120" height="32" style="stroke:#b9a6dd"/><text x="214" y="229">%27</text>
    <rect class="row-r" x="380" y="208" width="120" height="32" style="stroke:#e58870"/><text x="394" y="229" class="bad">'</text>
    <path class="wire" d="M140 224H200"/><path class="wire" d="M320 224H380"/>
    <text class="small" x="20" y="258">sent</text><text class="small" x="200" y="258">model sees</text><text class="small" x="380" y="258">backend runs</text>
    <rect class="row-r" x="20" y="286" width="200" height="32"/><text x="34" y="307">＜ｓｃｒｉｐｔ＞</text>
    <rect class="row-r" x="300" y="286" width="200" height="32"/><text x="314" y="307">&lt;script&gt;</text>
    <path class="wire" d="M220 302H300"/>
    <text class="small" x="300" y="336">after NFKD</text>
    <text x="20" y="384">fix: the same normalization in</text>
    <text x="20" y="408">training and in the sidecar</text>
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.75;1" calcMode="linear" path="M130 52H160M240 84V130"/></circle>
  </g>
  `,
};
