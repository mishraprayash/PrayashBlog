import type { Diagram } from "./types";

// TLS in Node: the handshake, its CPU cost, the missing intermediate, live rotation.
export const tls: Diagram = {
  label:
    "Diagram: a client and a Node.js HTTPS server. It shows the TLS handshake, handshakes queuing on Node's single thread, a server that sends only the leaf certificate, the same server sending the full chain, and setSecureContext loading a renewed certificate.",
  steps: 5,
  width: 520,
  height: 410,
  body: `
  <style>
    .dg-tls .seq { stroke: #716b65; stroke-width: 2; fill: none; }
    .dg-tls .head { fill: #716b65; }
    .dg-tls .job { fill: rgb(159 122 255 / .22); stroke: #b9a6dd; stroke-width: 1.5; }
    .dg-tls .wait { fill: #2b2824; stroke: #eea285; stroke-width: 1.5; stroke-dasharray: 4 3; }
    .dg-tls .gap { fill: none; stroke: #e58870; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .dg-tls .ok { fill: #86d1a8; }
    .dg-tls .bad { fill: #eea285; }
    .dg-tls .srv[data-hl-on] { stroke: #b9a6dd; fill: #1f1a2e; }
    .dg-tls .gauge { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); transition: transform 1.4s cubic-bezier(.2,.8,.2,1); }
    .dg-tls .gauge[data-hl-on] { transform: scaleX(.94); }
  </style>
  <rect class="box" x="20" y="20" width="160" height="80"/><text class="title" x="36" y="52">Client</text><text x="36" y="78">browser, curl</text>
  <rect class="box srv" data-hl="2" x="340" y="20" width="160" height="80"/><text class="title" x="356" y="52">Node.js</text><text x="356" y="78">https server</text>
  <path class="wire" d="M180 60H340"/>

  <g data-show="1">
    <path class="wire" d="M100 100V320"/><path class="wire" d="M420 100V320"/>
    <text x="140" y="142">ClientHello · SNI · key share</text>
    <path class="seq" d="M100 152H414"/><path class="head" d="M420 152l-9 -5v10z"/>
    <text x="130" y="192">ServerHello · chain · key share</text>
    <path class="seq" d="M106 202H420"/><path class="head" d="M100 202l9 -5v10z"/>
    <text class="tag" x="428" y="180" style="fill:#b9a6dd">ECDHE</text>
    <text x="140" y="242">Finished</text>
    <path class="seq" d="M100 252H414"/><path class="head" d="M420 252l-9 -5v10z"/>
    <text x="140" y="292">HTTP data, encrypted</text>
    <path class="seq" d="M100 302H420" style="stroke:#b9a6dd;stroke-dasharray:none"/>
    <circle class="pkt" r="8"><animateMotion dur="4s" repeatCount="indefinite" path="M100 152H420V202H100V252H420V302H100"/></circle>
    <text class="small" x="20" y="370">all of this happens before the first byte of HTTP</text>
  </g>

  <g data-show="2">
    <text class="tag" x="190" y="48">ClientHello × N</text>
    <circle class="pkt" r="6"><animateMotion dur="1.2s" repeatCount="indefinite" path="M180 60H340"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="1.2s" begin="-.3s" repeatCount="indefinite" path="M180 60H340"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="1.2s" begin="-.6s" repeatCount="indefinite" path="M180 60H340"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="1.2s" begin="-.9s" repeatCount="indefinite" path="M180 60H340"/></circle>
    <text x="40" y="156">Node's one thread</text>
    <rect class="job" x="40" y="168" width="70" height="36"/><text x="54" y="191">ECDHE</text>
    <rect class="job" x="116" y="168" width="70" height="36"/><text x="130" y="191">ECDHE</text>
    <rect class="job" x="192" y="168" width="70" height="36"/><text x="206" y="191">ECDHE</text>
    <rect class="job" x="268" y="168" width="70" height="36"/><text x="282" y="191">ECDHE</text>
    <rect class="job" x="344" y="168" width="70" height="36"/><text x="358" y="191">ECDHE</text>
    <rect class="wait" x="420" y="168" width="60" height="36"/><text x="430" y="191" style="fill:#eea285">timer</text>
    <text x="40" y="250">CPU</text>
    <rect x="40" y="260" width="440" height="16" fill="#2b2824"/><rect class="gauge" data-hl="2" x="40" y="260" width="440" height="16" fill="#b9a6dd"/>
    <text x="40" y="320" style="fill:#eea285">timers and I/O callbacks wait</text>
    <text class="small" x="40" y="346">asymmetric key exchange is the slow part (RSA 4096, ECDHE)</text>
  </g>

  <g data-show="3-4">
    <rect class="row-r" x="40" y="166" width="200" height="30"/><text x="54" y="186">leaf</text>
    <text class="small" x="260" y="186">roots ship with the client</text>
    <text class="small" x="260" y="221">intermediates don't</text>
  </g>
  <g data-show="3">
    <text x="40" y="150">cert: cert.pem</text>
    <rect class="gap" x="40" y="204" width="200" height="30"/><text x="54" y="224" style="fill:#eea285">intermediate</text>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" repeatCount="indefinite" path="M340 60H180"/></circle>
    <text x="40" y="282">Chrome: fetches it via AIA</text><text class="ok" x="440" y="282">ok</text>
    <text x="40" y="318">curl, Node, Go, Python</text><text class="bad" x="440" y="318">fail</text>
    <text class="bad" x="40" y="344">unable to verify the first certificate</text>
    <text class="small" x="40" y="390">openssl s_client -showcerts counts 1 certificate</text>
  </g>
  <g data-show="4">
    <text x="40" y="150">cert: fullchain.pem</text>
    <rect class="row-r" x="40" y="204" width="200" height="30"/><text x="54" y="224">intermediate</text>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" repeatCount="indefinite" path="M340 60H180"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-.8s" repeatCount="indefinite" path="M340 60H180"/></circle>
    <text x="40" y="282">Chrome</text><text class="ok" x="440" y="282">ok</text>
    <text x="40" y="318">curl, Node, Go, Python</text><text class="ok" x="440" y="318">ok</text>
    <text class="small" x="40" y="390">openssl s_client -showcerts counts 2 certificates</text>
  </g>

  <g data-show="5">
    <rect class="box" x="20" y="150" width="200" height="70"/><text class="title" x="36" y="180">Renewed cert</text><text x="36" y="204">on disk</text>
    <path class="wire" d="M220 185H420V100"/>
    <text x="236" y="174">setSecureContext()</text>
    <circle class="pkt" r="7"><animateMotion dur="2s" repeatCount="indefinite" path="M220 185H420V100"/></circle>
    <text class="small" x="236" y="206">re-read every 24 hours</text>
    <rect class="row-r" x="40" y="262" width="440" height="36" style="stroke:#86d1a8"/><text x="56" y="285">new handshakes: new cert</text>
    <rect class="row-r" x="40" y="312" width="440" height="36"/><text x="56" y="335">open connections: old cert till closed</text>
    <text class="small" x="40" y="390">no restart, no dropped connections</text>
  </g>
  `,
};
