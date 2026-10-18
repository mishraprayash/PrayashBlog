import type { Diagram } from "./types";

// Outbox: the dual write, the outbox fix, the ghost row, the full disk.
export const outbox: Diagram = {
  label:
    "Diagram: an order service writes to Postgres and publishes to Kafka. With an outbox table, a relay publishes from Postgres instead; the diagram then shows a skipped row and a replication slot filling the disk.",
  steps: 4,
  width: 520,
  height: 450,
  body: `
  <style>
    .dg-outbox .db-ok { stroke: transparent; }
    .dg-outbox .db-ok[data-hl-on] { stroke: #00b874; }
    .dg-outbox .db[data-hl-on] { stroke: #ff4f1a; fill: #2a1610; }
    .dg-outbox .r1[data-hl-on] { fill: rgb(255 79 26 / .22); stroke: #ff4f1a; }
    .dg-outbox .kafka[data-hl-on] { stroke: #ff4f1a; }
    .dg-outbox .gauge { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); transition: transform .9s cubic-bezier(.2,.8,.2,1); }
    .dg-outbox .gauge[data-hl-on] { transform: none; }
  </style>
  <rect class="box" x="20" y="40" width="160" height="70"/><text class="title" x="36" y="72">App</text><text x="36" y="94">order service</text>
  <rect class="box db" data-hl="4" x="200" y="20" width="160" height="150"/>
  <rect class="box db-ok" data-hl="2-3" x="200" y="20" width="160" height="150" style="fill:none"/>
  <text class="title" x="218" y="50">Postgres</text>
  <g data-show="2-">
    <text x="218" y="76">outbox</text>
    <rect class="row-r r1" data-hl="3" x="218" y="84" width="136" height="24"/><text x="226" y="101">id 1 · A</text>
    <rect class="row-r" x="218" y="114" width="136" height="24"/><text x="226" y="131">id 2 · B</text>
    <text class="tag" data-show="3" x="300" y="101" style="fill:#ff8a5c">skipped</text>
    <text class="tag" data-show="3" x="306" y="131" style="fill:#4ade80">sent</text>
  </g>
  <rect class="box" x="200" y="250" width="160" height="70"/><text class="title" x="218" y="282">Relay</text><text x="218" y="304">poll → publish</text>
  <rect class="box kafka" data-hl="1" x="400" y="250" width="100" height="70"/><text class="title" x="416" y="282">Kafka</text><text x="416" y="304">orders</text>
  <path class="wire" d="M180 75H200"/><path class="wire" d="M280 170V250"/><path class="wire" d="M360 285H400"/>
  <g data-show="1">
    <path class="wire" d="M95 110V370H450V320" style="stroke:#7a3420"/>
    <circle class="pkt" r="9"><animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;.78;.78" keyTimes="0;.7;1" calcMode="linear" path="M95 110V370H450V320"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.68;.74;1" dur="2.4s" repeatCount="indefinite"/></circle>
    <text x="436" y="360" style="font:900 30px var(--display);fill:#ff4f1a">✕</text>
    <text x="110" y="392">broker call fails after COMMIT</text>
  </g>
  <g data-show="2">
    <circle class="pkt" r="9" style="fill:#4ade80"><animateMotion dur="2.6s" repeatCount="indefinite" path="M180 75H280V285H450"/></circle>
  </g>
  <g data-show="4">
    <text x="30" y="396">pg_wal kept for the stalled slot</text>
    <rect x="30" y="404" width="300" height="16" fill="#26262b"/><rect class="gauge" data-hl="4" x="30" y="404" width="300" height="16" fill="#ff4f1a"/>
    <text x="30" y="440" style="fill:#ff8a5c">PANIC: No space left on device</text>
  </g>
  `,
};
