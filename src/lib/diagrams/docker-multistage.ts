import type { Diagram } from "./types";

// Docker multi-stage: deps -> builder -> runner, then the whiteout trap and
// PID 1 signal handling / zombie reaping.
export const dockerMultistage: Diagram = {
  label:
    "Diagram: a three-stage Docker build where deps installs all packages, builder compiles dist and prunes dev dependencies, and runner receives only dist, production node_modules and package.json; then a file deleted in a later layer that still ships in the lower layer; then Node as PID 1 ignoring SIGTERM and leaving zombies, fixed by tini.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-docker-multistage .hot { fill: #eea285; }
    .dg-docker-multistage .cool { fill: #86d1a8; }
    .dg-docker-multistage .gone { fill: #a9a49c; text-decoration: line-through; }
    .dg-docker-multistage .lay { fill: #221f1c; stroke: #403c38; stroke-width: 1.5; transition: fill .4s, stroke .4s; }
    .dg-docker-multistage .lay[data-hl-on] { fill: rgb(255 79 26 / .16); stroke: #e58870; }
    .dg-docker-multistage .chip { fill: #2b2824; }
    .dg-docker-multistage .zombie { fill: #2a1610; stroke: #e58870; stroke-width: 1.5; stroke-dasharray: 5 4; }
  </style>

  <!-- Steps 1-3: the three stages -->
  <g data-show="1-3">
    <rect class="box" data-hl="1" x="20" y="20" width="480" height="86"/>
    <text class="title" x="36" y="48">deps</text><text class="small" x="90" y="48">FROM node:20-slim</text>
    <text x="36" y="80">npm ci</text>
    <text class="small" x="110" y="80">node_modules: dev + prod</text>

    <rect class="box" data-hl="2" x="20" y="132" width="480" height="116"/>
    <text class="title" x="36" y="160">builder</text><text class="small" x="112" y="160">FROM node:20-slim</text>
    <g data-show="2-3">
      <text x="36" y="188">COPY --from=deps node_modules</text>
      <text x="36" y="212">npm run build  → dist/</text>
      <text x="36" y="236">npm prune --omit=dev</text>
    </g>

    <rect class="box" data-hl="3" x="20" y="274" width="480" height="116"/>
    <text class="title" x="36" y="302">runner</text><text class="small" x="106" y="302">FROM node:20-slim</text>
    <g data-show="3">
      <rect class="chip" x="36" y="316" width="196" height="26"/><text x="44" y="334">node_modules (prod)</text>
      <rect class="chip" x="36" y="350" width="64" height="26"/><text x="44" y="368">dist/</text>
      <rect class="chip" x="110" y="350" width="122" height="26"/><text x="118" y="368">package.json</text>
      <text class="small" x="300" y="330">left in builder:</text>
      <text class="gone" x="300" y="352">typescript</text>
      <text class="gone" x="300" y="374">src/   tests</text>
    </g>
  </g>
  <g data-show="1">
    <text class="small" x="36" y="198">waits for deps</text>
    <text class="small" x="36" y="340">waits for builder</text>
  </g>
  <g data-show="2">
    <path class="wire" d="M480 106V132"/>
    <circle class="pkt" r="7"><animateMotion dur="1.4s" repeatCount="indefinite" path="M480 96V146"/></circle>
    <text class="small" x="36" y="340">waits for builder</text>
  </g>
  <g data-show="3">
    <path class="wire" d="M480 248V274"/>
    <circle class="pkt" r="7"><animateMotion dur="1.4s" repeatCount="indefinite" path="M480 238V288"/></circle>
    <text class="cool" x="20" y="420">no compiler, no source, no tests</text>
  </g>

  <!-- Step 4: the whiteout trap -->
  <g data-show="4">
    <text class="title" x="20" y="40">Deleting in a later layer</text>
    <rect class="box" x="20" y="60" width="480" height="60"/>
    <text x="36" y="86">container view</text>
    <text class="small" x="36" y="106">data.tar.gz is not there</text>

    <rect class="lay" x="20" y="150" width="480" height="50"/><text x="36" y="180">RUN rm -rf /data.tar.gz</text>
    <rect class="chip" x="360" y="162" width="126" height="26"/><text class="tag" x="370" y="179" style="fill:#c8c3bc">whiteout 0:0</text>

    <rect class="lay" data-hl="4" x="20" y="210" width="480" height="50"/><text x="36" y="240">RUN curl -O /data.tar.gz</text>
    <rect class="chip" x="360" y="222" width="126" height="26" style="fill:#e58870"/><text class="tag" x="370" y="239" style="fill:#161311">data.tar.gz</text>

    <rect class="lay" x="20" y="270" width="480" height="50"/><text x="36" y="300">FROM node:20-slim</text>

    <text class="tag hot" x="20" y="342">the whiteout only hides it; the bytes stay in the layer below</text>
    <text class="tag hot" x="20" y="360">and every pull downloads them</text>
    <text class="cool" x="20" y="400">fix: download, extract and delete</text>
    <text class="cool" x="20" y="422">in one RUN, or in a discarded stage</text>
  </g>

  <!-- Step 5: PID 1 -->
  <g data-show="5">
    <text class="title" x="20" y="40">node as PID 1</text>
    <rect class="box" x="160" y="58" width="170" height="48" style="stroke:#e58870"/><text x="176" y="88">PID 1  node</text>
    <text x="20" y="88" style="fill:#eea285">SIGTERM</text>
    <path class="wire" d="M92 82H160" style="stroke:#7d4330"/>
    <circle class="pkt" r="6" style="fill:#e58870"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.6;1" calcMode="linear" path="M92 82H150"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.58;.64;1" dur="2s" repeatCount="indefinite"/></circle>
    <text x="340" y="88" style="font:900 22px var(--display);fill:#e58870">✕</text>
    <text class="tag hot" x="366" y="86">no handler</text>
    <rect class="zombie" x="160" y="126" width="80" height="34"/><text class="tag hot" x="170" y="147">zombie</text>
    <rect class="zombie" x="250" y="126" width="80" height="34"/><text class="tag hot" x="260" y="147">zombie</text>
    <path class="wire" d="M245 106V126"/>
    <text class="tag hot" x="20" y="186">children never reaped; stop ends in SIGKILL</text>

    <path d="M20 210H500" stroke="#403c38" stroke-width="1"/>

    <text class="title" x="20" y="246">tini as PID 1</text>
    <rect class="box" x="160" y="264" width="170" height="48" style="stroke:#5fae86"/><text x="176" y="294">PID 1  tini</text>
    <rect class="box" x="160" y="352" width="170" height="48"/><text x="176" y="382">node</text>
    <text x="20" y="294" style="fill:#86d1a8">SIGTERM</text>
    <path class="wire" d="M92 288H160"/><path class="wire" d="M245 312V352"/>
    <circle class="pkt" r="6"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.5;1" calcMode="linear" path="M92 288H154"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;0;1" keyTimes="0;.5;1" calcMode="linear" path="M245 318V346"/></circle>
    <text class="tag cool" x="346" y="286">forwards signals</text>
    <text class="tag cool" x="346" y="304">reaps zombies</text>
    <text class="tag cool" x="346" y="380">receives SIGTERM</text>
  </g>
  `,
};
