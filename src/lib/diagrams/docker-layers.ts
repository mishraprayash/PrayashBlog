import type { Diagram } from "./types";

// Docker layers: a container is a process on the host kernel, an image is a
// stack of layers, a change rebuilds its layer and every one after it, and
// .dockerignore keeps the build context small.
export const dockerLayers: Diagram = {
  label:
    "Diagram: a virtual machine with its own kernel next to two containers sharing the host kernel; then an image as a stack of layers where editing source rebuilds the npm ci layer until the package files are copied first; then .dockerignore filtering node_modules, .git and .env out of the build context.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-docker-layers .own[data-hl-on] { stroke: #e58870; }
    .dg-docker-layers .shared[data-hl-on] { stroke: #5fae86; fill: #11251c; }
    .dg-docker-layers .lay { fill: #221f1c; stroke: #403c38; stroke-width: 1.5; transition: fill .4s, stroke .4s; }
    .dg-docker-layers .lay[data-hl-on] { fill: rgb(255 79 26 / .16); stroke: #e58870; }
    .dg-docker-layers .lay.ok[data-hl-on] { fill: rgb(0 184 116 / .14); stroke: #5fae86; }
    .dg-docker-layers .rw { fill: none; stroke: #b9a6dd; stroke-width: 1.5; stroke-dasharray: 5 5; }
    .dg-docker-layers .hot { fill: #eea285; }
    .dg-docker-layers .cool { fill: #86d1a8; }
    .dg-docker-layers .gone { fill: #a9a49c; text-decoration: line-through; }
  </style>

  <!-- Step 1: VM vs container -->
  <g data-show="1">
    <text class="title" x="20" y="40">Virtual machine</text>
    <rect class="box" x="20" y="56" width="225" height="48"/><text x="36" y="86">App</text>
    <rect class="box own" data-hl="1" x="20" y="114" width="225" height="48"/><text x="36" y="144">guest OS + kernel</text>
    <rect class="box" x="20" y="172" width="225" height="48"/><text x="36" y="202">hypervisor</text>

    <text class="title" x="275" y="40">Container</text>
    <rect class="box" x="275" y="56" width="108" height="48"/><text x="291" y="86">App A</text>
    <rect class="box" x="392" y="56" width="108" height="48"/><text x="408" y="86">App B</text>
    <rect class="box" x="275" y="114" width="225" height="48"/><text x="291" y="144">namespaces + cgroups</text>
    <rect class="box shared" data-hl="1" x="275" y="172" width="225" height="48"/><text x="291" y="202">host kernel</text>
    <text class="tag cool" x="430" y="201">shared</text>

    <circle class="pkt" r="6" style="fill:#eea285"><animateMotion dur="2.4s" repeatCount="indefinite" path="M230 80V202"/></circle>
    <circle class="pkt" r="6"><animateMotion dur="1.4s" repeatCount="indefinite" path="M488 80V188"/></circle>

    <rect class="box" x="20" y="256" width="480" height="96"/>
    <text class="title" x="36" y="284">A container is a Linux process</text>
    <text x="36" y="310">namespaces: what it can see</text>
    <text class="small" x="300" y="310">pid, net, mnt, user</text>
    <text x="36" y="334">cgroups: what it can use</text>
    <text class="small" x="300" y="334">cpu, memory, i/o</text>
    <text class="small" x="20" y="384">a VM boots its own kernel; containers share one</text>
  </g>

  <!-- Steps 2-4: the layer stack -->
  <g data-show="2-4">
    <text class="title" x="20" y="40">Image layers</text>
    <text class="small" x="20" y="60">built bottom to top, each one read-only</text>
    <rect class="lay ok" data-hl="3-4" x="20" y="330" width="480" height="46"/><text x="36" y="358">FROM node:20-slim</text>
    <text class="tag cool" data-show="3-4" x="430" y="357">cached</text>
  </g>

  <g data-show="2-3">
    <rect class="lay" data-hl="3" x="20" y="274" width="480" height="46"/><text x="36" y="302">COPY . .</text>
    <rect class="lay" data-hl="3" x="20" y="218" width="480" height="46"/><text x="36" y="246">RUN npm ci</text>
  </g>
  <g data-show="2">
    <rect class="rw" x="20" y="162" width="480" height="46"/><text x="36" y="190" style="fill:#b9a6dd">container layer</text>
    <text class="tag" x="410" y="189" style="fill:#b9a6dd">writable</text>
    <text class="small" x="20" y="410">running the image adds one writable layer on top</text>
  </g>
  <g data-show="3">
    <text class="tag hot" x="430" y="301">rebuilt</text>
    <text class="tag hot" x="430" y="245">rebuilt</text>
    <text class="hot" x="150" y="302">← you edit src/</text>
    <circle class="pkt" r="8" style="fill:#e58870"><animateMotion dur="2.2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear" path="M480 297V230"/></circle>
    <text class="hot" x="20" y="410">npm ci re-runs on every commit</text>
  </g>

  <g data-show="4">
    <rect class="lay ok" data-hl="4" x="20" y="274" width="480" height="46"/><text x="36" y="302">COPY package.json package-lock.json ./</text>
    <rect class="lay ok" data-hl="4" x="20" y="218" width="480" height="46"/><text x="36" y="246">RUN npm ci</text>
    <rect class="lay" data-hl="4" x="20" y="162" width="480" height="46"/><text x="36" y="190">COPY . .</text>
    <text class="tag cool" x="430" y="301">cached</text>
    <text class="tag cool" x="430" y="245">cached</text>
    <text class="tag hot" x="430" y="189">rebuilt</text>
    <text class="hot" x="150" y="190">← you edit src/</text>
    <text class="cool" x="20" y="410">npm ci stays cached until the lockfile changes</text>
  </g>

  <!-- Step 5: .dockerignore and the build context -->
  <g data-show="5">
    <text class="title" x="20" y="40">docker build .</text>
    <rect class="box" x="20" y="74" width="190" height="226"/><text class="title" x="32" y="100">project dir</text>
    <text x="32" y="130">src/</text>
    <text x="32" y="156">package.json</text>
    <text x="32" y="182">package-lock.json</text>
    <text class="gone" x="32" y="222">node_modules</text>
    <text class="gone" x="32" y="248">.git</text>
    <text class="gone" x="32" y="274">.env</text>

    <text x="200" y="60" style="fill:#eea285">.dockerignore</text>
    <rect x="252" y="110" width="14" height="170" fill="#2a1610" stroke="#e58870" stroke-width="1.5"/>

    <rect class="box" x="310" y="74" width="190" height="226"/><text class="title" x="322" y="100">daemon</text>
    <text class="small" x="322" y="118">build context</text>
    <text x="322" y="150">src/</text>
    <text x="322" y="176">package.json</text>
    <text x="322" y="202">package-lock.json</text>

    <path class="wire" d="M210 160H310"/>
    <path class="wire" d="M210 245H252" style="stroke:#7d4330"/>
    <circle class="pkt" r="7"><animateMotion dur="2s" repeatCount="indefinite" path="M210 160H310"/></circle>
    <circle class="pkt" r="7" style="fill:#e58870"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.6;1" calcMode="linear" path="M210 245H246"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.58;.64;1" dur="2s" repeatCount="indefinite"/></circle>
    <text x="272" y="252" style="font:900 22px var(--display);fill:#e58870">✕</text>

    <text x="20" y="340">The CLI tars the directory and sends it.</text>
    <text class="hot" x="20" y="366">without .dockerignore: node_modules, .git</text>
    <text class="hot" x="20" y="388">and your .env secrets go along too</text>
  </g>
  `,
};
