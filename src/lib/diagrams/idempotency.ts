import type { Diagram } from "./types";

// Idempotency: the Redis lock's crash window, the claim row in the same
// transaction, a duplicate waiting on it, the replay, and the external call.
export const idempotency: Diagram = {
  label:
    "Diagram: two requests with the same idempotency key. With a Redis lock, a crashed first attempt leaves the key set and the retry gets a 409. With a claim row written in the same Postgres transaction as the transfer, the duplicate waits on the uncommitted row and then replays the stored response. For an external call, the claim is committed first and the provider gets a key derived from it.",
  steps: 5,
  width: 520,
  height: 460,
  body: `
  <style>
    .dg-idempotency .txn { fill: none; stroke: #3a3a40; stroke-width: 1.5; stroke-dasharray: 4 4; transition: stroke .4s; }
    .dg-idempotency .txn[data-hl-on] { stroke: #ff4f1a; }
    .dg-idempotency .txn-done { fill: none; stroke: transparent; stroke-width: 1.5; transition: stroke .4s; }
    .dg-idempotency .txn-done[data-hl-on] { stroke: #00b874; }
    .dg-idempotency .claim[data-hl-on] { fill: rgb(255 79 26 / .22); stroke: #ff4f1a; }
    .dg-idempotency .claim-ok[data-hl-on] { fill: rgb(0 184 116 / .2); stroke: #00b874; }
    .dg-idempotency .wait { fill: #1c1c20; stroke: #ff8a5c; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .dg-idempotency .gauge { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); transition: transform 4s linear; }
    .dg-idempotency .gauge[data-hl-on] { transform: scaleX(.6); }
  </style>

  <!-- the two requests -->
  <rect class="box" data-hl="2" x="20" y="40" width="160" height="62"/>
  <text class="title" x="34" y="66">Request A</text>
  <text x="34" y="88" data-show="1">key 123</text>
  <text x="34" y="88" data-show="2-">key abc</text>
  <rect class="box" data-hl="3-4" x="20" y="250" width="160" height="62"/>
  <text class="title" x="34" y="276">Request B</text>
  <text x="34" y="298" data-show="1">retry, key 123</text>
  <text x="34" y="298" data-show="2-">same key abc</text>

  <!-- step 1: Redis lock -->
  <g data-show="1">
    <rect class="box" x="230" y="40" width="270" height="90"/>
    <text class="title" x="248" y="70">Redis</text>
    <text x="248" y="96">idem:123 = 1</text>
    <text class="small" x="248" y="116">SET NX EX 60 → OK</text>
    <path class="wire" d="M180 71H230"/>
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" path="M180 71H230"/></circle>
    <text x="64" y="138" style="font:900 30px var(--display);fill:#ff4f1a">✕</text>
    <text x="20" y="166" style="fill:#ff8a5c">worker killed</text>
    <text class="small" x="20" y="186">before Postgres or the card</text>
    <path class="wire" d="M180 281H365V130"/>
    <text x="248" y="200" style="fill:#ff8a5c">key exists</text>
    <text x="20" y="342" style="fill:#ff8a5c">← 409</text>
    <text x="230" y="400">payment never happens</text>
    <text class="small" x="230" y="420">the "done" record and the work</text>
    <text class="small" x="230" y="436">live in different systems</text>
  </g>

  <!-- steps 2-5: Postgres -->
  <g data-show="2-">
    <rect class="box" x="230" y="20" width="270" height="330"/>
    <text class="title" x="248" y="48">Postgres</text>
    <rect class="txn" data-hl="2-3" x="244" y="60" width="242" height="104"/>
    <rect class="txn-done" data-hl="4-5" x="244" y="60" width="242" height="104"/>
    <text class="small" x="254" y="78" data-show="2-3" style="fill:#ff8a5c">txn A, not committed</text>
    <text class="small" x="254" y="78" data-show="4" style="fill:#4ade80">txn A committed</text>
    <text class="small" x="254" y="78" data-show="5" style="fill:#4ade80">txn 1 committed</text>

    <rect class="row-r claim" data-hl="2-3" x="254" y="88" width="222" height="28"/>
    <rect class="row-r claim" data-hl="5" x="254" y="88" width="222" height="28" style="fill:none"/>
    <rect class="row-r claim-ok" data-hl="4" x="254" y="88" width="222" height="28" style="fill:none"/>
    <text x="262" y="107">claim abc</text>
    <text class="tag" x="360" y="106" data-show="2-3" style="fill:#ff8a5c">IN_PROGRESS</text>
    <text class="tag" x="360" y="106" data-show="4" style="fill:#4ade80">COMPLETED 201</text>
    <text class="tag" x="360" y="106" data-show="5" style="fill:#ff8a5c">IN_PROGRESS</text>
    <rect class="row-r" x="254" y="124" width="222" height="28"/>
    <text x="262" y="143" data-show="2-4">transfer row</text>
    <text x="262" y="143" data-show="5">payment PENDING</text>

    <path class="wire" d="M180 71H230"/>
    <path class="wire" d="M180 281H230"/>
  </g>

  <g data-show="2">
    <circle class="pkt" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M180 71H254"/></circle>
    <text x="248" y="196">claim + transfer</text>
    <text x="248" y="218">commit together</text>
    <text class="small" x="248" y="244">only A can see its claim</text>
    <text class="small" x="248" y="262">until COMMIT</text>
  </g>

  <g data-show="3">
    <rect class="wait" x="248" y="266" width="236" height="30"/>
    <text x="258" y="286">INSERT … ON CONFLICT</text>
    <path class="wire" d="M366 266V152" style="stroke:#ff8a5c"/>
    <text x="374" y="214" style="fill:#ff8a5c">waits on</text>
    <text x="374" y="234" style="fill:#ff8a5c">A's row</text>
    <circle r="7" cx="366" cy="200" style="fill:#ff8a5c"><animate attributeName="opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/></circle>
    <text class="small" x="248" y="318">lock_timeout 5s</text>
    <rect x="248" y="326" width="236" height="10" fill="#26262b"/>
    <rect class="gauge" data-hl="3" x="248" y="326" width="236" height="10" fill="#ff8a5c"/>
    <text x="20" y="342" style="fill:#ff8a5c">waiting…</text>
    <text class="small" x="20" y="362">holds a pooled connection</text>
  </g>

  <g data-show="4">
    <text x="248" y="196" style="fill:#4ade80">B's INSERT: 0 rows</text>
    <text x="248" y="218">SELECT stored response</text>
    <path class="wire" d="M254 102H210V281H180" style="stroke:#1d6b4b"/>
    <circle class="pkt" r="8" style="fill:#4ade80"><animateMotion dur="2.4s" repeatCount="indefinite" path="M254 102H210V281H180"/></circle>
    <text x="20" y="342" style="fill:#4ade80">same hash → 201</text>
    <text class="small" x="20" y="362">replayed, one transfer</text>
    <text x="20" y="392" style="fill:#ff8a5c">other hash → 422</text>
  </g>

  <g data-show="5">
    <rect class="box" x="230" y="370" width="270" height="70"/>
    <text class="title" x="248" y="398">Stripe</text>
    <text x="248" y="422">idempotencyKey pay_abc</text>
    <path class="wire" d="M180 92H205V405H230"/>
    <circle class="pkt" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M180 92H205V405H230"/></circle>
    <text x="248" y="196">B sees the committed</text>
    <text x="248" y="218">IN_PROGRESS claim</text>
    <text class="small" x="248" y="250">stale after 5 minutes:</text>
    <text class="small" x="248" y="268">a retry takes the lease and</text>
    <text class="small" x="248" y="286">resends the same key</text>
    <text x="20" y="342" style="fill:#ff8a5c">409</text>
    <text class="small" x="20" y="362">Retry-After</text>
  </g>
  `,
};
