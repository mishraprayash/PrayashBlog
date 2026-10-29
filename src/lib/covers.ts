/**
 * Cover art: one small animated SVG per post, drawn from what the post is
 * about. A post picks its cover with `cover:` in the frontmatter; posts
 * without one get the plain pillar cover.
 *
 * The SVGs are rendered at build time and animated with SMIL, so they ship no
 * JS of their own. BaseLayout pauses them when they're off screen or when
 * motion is off ([data-anim] marks them). Every cover is decorative: the post
 * title is always next to it, so they're hidden from assistive tech.
 *
 * Text in the art is labels only. Numbers that would need a source stay out.
 */
import type { PillarId } from "../data/taxonomy";

const INK = "#1b1814";
const PAPER = "#f4f0e7";
const GREY = "#9d978e";
const MSG = "#d77c60";
const PG = "#6198c6";
const RUN = "#64aa85";
const EDGE = "#9b86c1";
const MONO = `font-family="IBM Plex Mono, monospace"`;
const DISPLAY = `font-family="Archivo Variable, Arial Black, sans-serif" font-weight="900"`;

const svg = (body: string) =>
  `<svg class="cover-svg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid meet" data-anim aria-hidden="true" focusable="false">${body}</svg>`;

/** A faint 20px grid, as a single path so no ids are needed. Like the
 * background rects, it runs well past the viewBox, so a cover shown with
 * "meet" in a box of another shape has no empty bands. */
const grid = (stroke: string) => {
  let d = "";
  for (let x = -600; x < 1000; x += 20) d += `M${x} -400V660`;
  for (let y = -400; y < 660; y += 20) d += `M-600 ${y}H1000`;
  return `<path d="${d}" stroke="${stroke}" stroke-width="1" fill="none"/>`;
};
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export const COVERS = {
  // App → Postgres + outbox → relay → Kafka. The direct dual-write path loses
  // its packet halfway; the outbox path always arrives.
  outbox: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${INK}"/>${grid("#2a2723")}
    <g ${MONO} font-size="10" fill="${GREY}">
      <rect x="30" y="40" width="80" height="44" fill="none" stroke="${PAPER}" stroke-width="2"/><text x="44" y="66">app</text>
      <rect x="160" y="30" width="96" height="64" fill="none" stroke="${PAPER}" stroke-width="2"/><text x="174" y="52">postgres</text>
      <rect x="170" y="62" width="76" height="22" fill="${MSG}"/><text x="178" y="77" fill="${INK}">outbox</text>
      <rect x="160" y="170" width="96" height="44" fill="none" stroke="${PAPER}" stroke-width="2"/><text x="186" y="196">relay</text>
      <rect x="300" y="100" width="76" height="60" fill="none" stroke="${PAPER}" stroke-width="2"/><text x="320" y="134">kafka</text>
    </g>
    <path d="M110 62H160M208 94V170M256 192H338V160" stroke="${PAPER}" stroke-width="2" fill="none" stroke-dasharray="5 6"><animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite"/></path>
    <path d="M110 50C200 0 300 20 338 100" stroke="${MSG}" stroke-width="2" fill="none" stroke-dasharray="3 6" opacity=".7"/>
    <circle r="6" fill="${MSG}"><animateMotion dur="3.2s" repeatCount="indefinite" path="M110 62H208V192H338V160"/></circle>
    <circle r="6" fill="${PAPER}"><animateMotion dur="3.2s" begin="-1.6s" repeatCount="indefinite" path="M110 62H208V192H338V160"/></circle>
    <circle r="6" fill="${MSG}"><animateMotion dur="2.4s" repeatCount="indefinite" keyPoints="0;.62;.62" keyTimes="0;.6;1" calcMode="linear" path="M110 50C200 0 300 20 338 100"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.6;.65;1" dur="2.4s" repeatCount="indefinite"/></circle>
    <text x="262" y="34" ${MONO} font-size="16" fill="${MSG}" font-weight="600" opacity="0">✕<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.58;.62;.9;1" dur="2.4s" repeatCount="indefinite"/></text>`),

  // Three copies of one request converge; one row is written once.
  idempotency: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${MSG}"/>
    ${[50, 130, 210]
      .map(
        (y, i) =>
          `<path d="M20 ${y}C140 ${y} 160 130 250 130" stroke="${INK}" stroke-width="2" fill="none"/><circle r="9" fill="${INK}"><animateMotion dur="2.6s" begin="-${i * 0.25}s" repeatCount="indefinite" path="M20 ${y}C140 ${y} 160 130 250 130"/></circle>`,
      )
      .join("")}
    <rect x="250" y="96" width="120" height="68" fill="${PAPER}" stroke="${INK}" stroke-width="3"/>
    <text x="262" y="122" ${MONO} font-size="11" fill="${INK}">key: abc</text>
    <text x="262" y="146" ${MONO} font-size="11" fill="${INK}" font-weight="600">1 row · 201<animate attributeName="opacity" values=".2;1;1;.2" dur="2.6s" repeatCount="indefinite"/></text>
    <text x="22" y="246" ${DISPLAY} font-size="22" fill="${INK}">×3 → ×1</text>`),

  // A queue hands each message to one worker; a topic copies it to every
  // subscriber; a stream keeps a log that readers move through at their own pace.
  queues: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PAPER}"/>
    <g ${MONO} font-size="10" fill="${INK}"><text x="16" y="44">QUEUE</text><text x="16" y="124">TOPIC</text><text x="16" y="204">STREAM</text></g>
    <path d="M80 40H360" stroke="${INK}" stroke-width="2"/>
    ${[0, 0.7, 1.4].map((d) => `<rect x="80" width="16" height="16" y="32" fill="${INK}"><animate attributeName="x" from="80" to="344" dur="2.1s" begin="-${d}s" repeatCount="indefinite"/></rect>`).join("")}
    <path d="M80 120H200M200 120L360 90M200 120H360M200 120L360 150" stroke="${INK}" stroke-width="2" fill="none"/>
    ${[90, 120, 150].map((y) => `<circle r="7" fill="${MSG}"><animateMotion dur="2s" repeatCount="indefinite" path="M80 120H200L360 ${y}"/></circle>`).join("")}
    ${range(14).map((i) => `<rect x="${80 + i * 20}" y="190" width="18" height="24" fill="${i % 3 ? INK : MSG}"/>`).join("")}
    <path d="M0 0V-14" stroke="${INK}" stroke-width="3"><animateTransform attributeName="transform" type="translate" values="90 186;350 186" dur="4s" repeatCount="indefinite"/></path>
    <path d="M0 0V-14" stroke="${MSG}" stroke-width="3"><animateTransform attributeName="transform" type="translate" values="90 186;350 186" dur="7s" repeatCount="indefinite"/></path>`),

  // Event in, a registry picks the channel strategy, out to one of four channels.
  dispatch: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PAPER}"/>
    <rect x="24" y="108" width="70" height="44" fill="${INK}"/><text x="36" y="134" ${MONO} font-size="10" fill="${PAPER}">event</text>
    <rect x="140" y="80" width="100" height="100" fill="${MSG}" stroke="${INK}" stroke-width="3"/>
    <text x="152" y="104" ${MONO} font-size="10" fill="${INK}">registry</text>
    <text x="152" y="124" ${MONO} font-size="10" fill="${INK}">.get(channel)</text>
    ${["EMAIL", "SMS", "PUSH", "WEBHOOK"].map((t, i) => `<rect x="290" y="${28 + i * 56}" width="92" height="36" fill="none" stroke="${INK}" stroke-width="2"/><text x="300" y="${50 + i * 56}" ${MONO} font-size="10" fill="${INK}">${t}</text><path d="M240 130L290 ${46 + i * 56}" stroke="${INK}" stroke-width="1.5" fill="none" stroke-dasharray="3 4"/>`).join("")}
    <path d="M94 130H140" stroke="${INK}" stroke-width="2"/>
    ${[0, 1, 2, 3].map((i) => `<circle r="7" fill="${INK}"><animateMotion dur="4.8s" begin="-${i * 1.2}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;${(i * 0.25).toFixed(2)};${(i * 0.25 + 0.22).toFixed(2)};1" calcMode="linear" path="M60 130H190L290 ${46 + i * 56}"/></circle>`).join("")}`),

  // Leaf → intermediate → root; the middle link blinks because it isn't sent.
  tls: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${EDGE}"/>
    ${["LEAF", "INTERMEDIATE", "ROOT"]
      .map(
        (t, i) =>
          `<g transform="translate(${40 + i * 116} 96)"><rect width="96" height="68" rx="34" fill="none" stroke="${INK}" stroke-width="6" ${i === 1 ? `stroke-dasharray="10 8"` : ""}>${i === 1 ? `<animate attributeName="opacity" values="1;.15;1" dur="1.6s" repeatCount="indefinite"/>` : ""}</rect><text x="48" y="40" text-anchor="middle" ${MONO} font-size="${i === 1 ? 9 : 11}" fill="${INK}" font-weight="600">${t}</text></g>`,
      )
      .join("")}
    <text x="40" y="214" ${MONO} font-size="11" fill="${INK}">unable to verify the first certificate</text>`),

  // Requests enter Nginx; Lua asks the model sidecar for a score, then passes
  // or blocks.
  "waf-gatekeeper": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${INK}"/>${grid("#24211e")}
    <rect x="130" y="50" width="120" height="80" fill="none" stroke="${PAPER}" stroke-width="2"/>
    <text x="142" y="72" ${MONO} font-size="10" fill="${GREY}">nginx</text>
    <rect x="142" y="84" width="96" height="30" fill="${EDGE}"/><text x="150" y="103" ${MONO} font-size="10" fill="${INK}">access_by_lua</text>
    <rect x="130" y="180" width="120" height="50" fill="none" stroke="${EDGE}" stroke-width="2"/><text x="142" y="210" ${MONO} font-size="10" fill="${EDGE}">model sidecar</text>
    <rect x="320" y="70" width="60" height="40" fill="none" stroke="${PAPER}" stroke-width="2"/><text x="330" y="94" ${MONO} font-size="10" fill="${GREY}">app</text>
    <path d="M190 130V180" stroke="${EDGE}" stroke-width="2" stroke-dasharray="4 4"><animate attributeName="stroke-dashoffset" from="16" to="0" dur=".6s" repeatCount="indefinite"/></path>
    <path d="M20 90H130M250 90H320" stroke="${PAPER}" stroke-width="2" fill="none"/>
    <circle r="6" fill="${PAPER}"><animateMotion dur="3s" repeatCount="indefinite" path="M20 90H190V180V90H320"/></circle>
    <circle r="6" fill="${MSG}"><animateMotion dur="3s" begin="-1.5s" repeatCount="indefinite" keyPoints="0;.72;.72" keyTimes="0;.75;1" calcMode="linear" path="M20 90H190V180V90H320"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.74;.78;1" dur="3s" begin="-1.5s" repeatCount="indefinite"/></circle>
    <text x="270" y="150" ${MONO} font-size="10" fill="${GREY}">score → pass / 403</text>`),

  // Most bad requests stop at the gate; one goes round it.
  "waf-bypass": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${INK}"/>
    <rect x="196" y="20" width="10" height="190" fill="${EDGE}"/>
    ${[50, 90, 130, 170]
      .map((y, i) =>
        i % 2
          ? `<circle r="7" cy="${y}" fill="${MSG}"><animate attributeName="cx" values="20;190;190" keyTimes="0;.6;1" dur="2.2s" begin="-${i * 0.3}s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0" keyTimes="0;.62;.7" dur="2.2s" begin="-${i * 0.3}s" repeatCount="indefinite"/></circle>`
          : `<circle r="7" cy="${y}" fill="${PAPER}"><animate attributeName="cx" from="20" to="390" dur="2.2s" begin="-${i * 0.3}s" repeatCount="indefinite"/></circle>`,
      )
      .join("")}
    <path d="M20 200C120 200 150 236 200 236S290 200 390 200" stroke="${MSG}" stroke-width="1.5" stroke-dasharray="3 5" fill="none"/>
    <circle r="7" fill="${MSG}"><animateMotion dur="3.4s" repeatCount="indefinite" path="M20 200C120 200 150 236 200 236S290 200 390 200"/></circle>
    <text x="214" y="34" ${MONO} font-size="10" fill="${EDGE}">body spilled to disk</text>`),

  // A signed URL lets the browser upload straight to the bucket.
  s3: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PAPER}"/>
    <rect x="30" y="100" width="70" height="60" fill="${INK}"/><rect x="165" y="30" width="70" height="50" fill="none" stroke="${INK}" stroke-width="3"/><path d="M300 90h70v80l-35 20-35-20z" fill="${EDGE}"/>
    <g ${MONO} font-size="10" fill="${INK}"><text x="40" y="180">browser</text><text x="186" y="60">API</text><text x="314" y="212">bucket</text></g>
    <path d="M100 110L165 60M235 60L100 120" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 4" fill="none"/>
    <path d="M100 140C190 160 230 150 300 130" stroke="${EDGE}" stroke-width="10" fill="none" stroke-dasharray="14 10"><animate attributeName="stroke-dashoffset" from="48" to="0" dur=".8s" repeatCount="indefinite"/></path>`),

  // Image layers stack; a change near the top rebuilds only what's above it.
  "docker-layers": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${RUN}"/>
    ${["FROM node:20-slim", "COPY package*.json", "RUN npm ci", "COPY . .", "CMD node dist/main"]
      .map((t, i) => {
        const y = 196 - i * 38;
        const rebuilt = i >= 3;
        return `<rect x="60" y="${y}" width="280" height="30" fill="${INK}">${rebuilt ? `<animate attributeName="fill" values="${INK};${PAPER};${INK}" dur="2.4s" begin="${(i - 3) * 0.2}s" repeatCount="indefinite"/>` : ""}</rect><text x="72" y="${y + 19}" ${MONO} font-size="10" fill="${rebuilt ? GREY : PAPER}">${t}</text><text x="282" y="${y + 19}" ${MONO} font-size="9" fill="${rebuilt ? MSG : RUN}">${rebuilt ? "REBUILD" : "CACHED"}</text>`;
      })
      .join("")}`),

  // The build stage is big; only its output is copied into a small runtime.
  "docker-multistage": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${RUN}"/>
    ${range(6).map((i) => `<rect x="40" y="${200 - i * 30}" width="130" height="24" fill="${INK}"/>`).join("")}
    ${range(2).map((i) => `<rect x="250" y="${200 - i * 30}" width="110" height="24" fill="${INK}"/>`).join("")}
    <rect x="68" y="56" width="74" height="16" fill="${PAPER}"/>
    <rect width="74" height="16" fill="${PAPER}"><animate attributeName="x" values="68;68;268;268" keyTimes="0;.15;.7;1" dur="3s" repeatCount="indefinite"/><animate attributeName="y" values="56;56;146;146" keyTimes="0;.15;.7;1" dur="3s" repeatCount="indefinite"/></rect>
    <g ${MONO} font-size="10" fill="${INK}"><text x="40" y="244">AS builder</text><text x="250" y="244">AS runner</text><text x="74" y="50">dist/</text></g>`),

  // A pod: the app talks to its sidecar on localhost; the sidecar talks to
  // the building blocks.
  "dapr-sidecar": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${INK}"/>${grid("#24211e")}
    <rect x="40" y="70" width="170" height="120" fill="none" stroke="${PAPER}" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="50" y="88" ${MONO} font-size="10" fill="${GREY}">pod</text>
    <rect x="56" y="100" width="70" height="70" fill="${PAPER}"/><text x="66" y="140" ${MONO} font-size="10" fill="${INK}">app</text>
    <rect x="140" y="100" width="54" height="70" fill="${RUN}"/><text x="146" y="140" ${MONO} font-size="10" fill="${INK}">daprd</text>
    ${["state", "pub/sub", "secrets", "bindings"].map((t, i) => `<rect x="280" y="${30 + i * 52}" width="96" height="34" fill="none" stroke="${RUN}" stroke-width="2"/><text x="290" y="${51 + i * 52}" ${MONO} font-size="10" fill="${RUN}">${t}</text><path d="M194 135L280 ${47 + i * 52}" stroke="#36322e" stroke-width="1.5"/>`).join("")}
    ${range(4).map((i) => `<circle r="5" fill="${RUN}"><animateMotion dur="2.8s" begin="-${i * 0.7}s" repeatCount="indefinite" path="M126 135H194L280 ${47 + i * 52}"/></circle>`).join("")}`),

  // Service invocation: calls go sidecar to sidecar between pods.
  "dapr-invoke": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${INK}"/>
    ${[
      [40, 50],
      [230, 50],
      [135, 160],
    ]
      .map(
        ([x, y]) =>
          `<rect x="${x}" y="${y}" width="130" height="60" fill="none" stroke="${PAPER}" stroke-width="2"/><rect x="${x + 8}" y="${y + 8}" width="70" height="44" fill="${PAPER}"/><rect x="${x + 86}" y="${y + 8}" width="36" height="44" fill="${RUN}"/>`,
      )
      .join("")}
    <path d="M162 80H252L240 168H162" stroke="${RUN}" stroke-width="2" fill="none" stroke-dasharray="4 5"/>
    <circle r="6" fill="${RUN}"><animateMotion dur="2.4s" repeatCount="indefinite" path="M162 80H252L240 168H162"/></circle>`),

  // State with an ETag check on one side, pub/sub fan-out on the other.
  "dapr-state": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${RUN}"/>
    <rect x="150" y="100" width="100" height="60" fill="${INK}"/><text x="176" y="135" ${MONO} font-size="11" fill="${PAPER}">daprd</text>
    <path d="M60 60h70v70l-35 18-35-18z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><text x="66" y="96" ${MONO} font-size="10" fill="${INK}">state</text>
    <text x="32" y="186" ${MONO} font-size="10" fill="${INK}">If-Match: etag 7</text>
    <path d="M150 120L130 100" stroke="${INK}" stroke-width="2"/>
    <circle r="6" fill="${PAPER}"><animateMotion dur="2s" repeatCount="indefinite" path="M150 120L100 96"/></circle>
    ${[50, 130, 210].map((y, i) => `<rect x="310" y="${y - 18}" width="70" height="36" fill="none" stroke="${INK}" stroke-width="2"/><text x="318" y="${y + 4}" ${MONO} font-size="10" fill="${INK}">sub ${i + 1}</text><path d="M250 130L310 ${y}" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 4"/><circle r="6" fill="${INK}"><animateMotion dur="2.2s" begin="-${i * 0.15}s" repeatCount="indefinite" path="M250 130L310 ${y}"/></circle>`).join("")}`),

  // A cluster: nodes full of pods, each with its injected sidecar.
  "dapr-k8s": () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PAPER}"/>
    ${range(3)
      .map(
        (n) =>
          `<rect x="${20 + n * 126}" y="60" width="114" height="150" fill="none" stroke="${INK}" stroke-width="2"/><text x="${28 + n * 126}" y="78" ${MONO} font-size="9" fill="${INK}">node ${n + 1}</text>${range(3)
            .map(
              (p) =>
                `<rect x="${30 + n * 126}" y="${88 + p * 38}" width="62" height="28" fill="${INK}"/><rect x="${96 + n * 126}" y="${88 + p * 38}" width="28" height="28" fill="${RUN}">${(n + p) % 3 === 0 ? `<animate attributeName="opacity" values="0;1;1" keyTimes="0;.3;1" dur="3s" begin="-${n * 0.4 + p * 0.2}s" repeatCount="indefinite"/>` : ""}</rect>`,
            )
            .join("")}`,
      )
      .join("")}
    <rect x="20" y="20" width="366" height="26" fill="${INK}"/><text x="30" y="37" ${MONO} font-size="10" fill="${RUN}">dapr-sidecar-injector · placement · sentry</text>
    <text x="20" y="238" ${MONO} font-size="10" fill="${INK}">dapr.io/enabled: "true"</text>`),

  // A wall of pods, a few of them crash-looping.
  k9s: () =>
    svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PAPER}"/>
    ${range(40)
      .map((i) => {
        const x = 30 + (i % 10) * 35;
        const y = 40 + Math.floor(i / 10) * 45;
        const bad = [7, 18, 26, 33].includes(i);
        return `<rect x="${x}" y="${y}" width="26" height="30" fill="${bad ? MSG : INK}">${bad ? `<animate attributeName="opacity" values="1;.2;1" dur="${1 + (i % 3) * 0.4}s" repeatCount="indefinite"/>` : ""}</rect>`;
      })
      .join("")}
    <text x="30" y="238" ${MONO} font-size="11" fill="${INK}">CrashLoopBackOff · 4 / 40</text>`),
} satisfies Record<string, () => string>;

export type CoverId = keyof typeof COVERS;
export const COVER_IDS = Object.keys(COVERS) as [CoverId, ...CoverId[]];

const PILLAR_FILL: Record<PillarId, string> = {
  messaging: MSG,
  postgresql: PG,
  "running-services": RUN,
  "network-edge": EDGE,
};

/** Plain fallback: the pillar colour with a slow scan line. */
function pillarCover(pillar: PillarId) {
  return svg(`
    <rect x="-600" y="-400" width="1600" height="1060" fill="${PILLAR_FILL[pillar]}"/>${grid("rgba(17,17,17,.12)")}
    <rect x="-600" width="1600" height="3" fill="${INK}"><animate attributeName="y" values="0;257;0" dur="8s" repeatCount="indefinite"/></rect>`);
}

export function coverSvg(id: CoverId | undefined, pillar: PillarId): string {
  return id ? COVERS[id]() : pillarCover(pillar);
}
