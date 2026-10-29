// Renders one scroll diagram at every step, without a site build, so a
// diagram can be checked while it's being drawn:
//   node scripts/preview-diagram.mjs src/lib/diagrams/outbox.ts [outDir]
// Writes <outDir>/<id>-step<N>.png and <outDir>/<id>-all.png (all steps
// side by side). Needs Node 22.18+ (it imports the .ts file directly).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const [file, outDir = "diagram-preview"] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/preview-diagram.mjs src/lib/diagrams/<id>.ts [outDir]");
  process.exit(1);
}
const mod = await import(pathToFileURL(path.resolve(file)).href);
const [id, d] = Object.entries(mod).find(([, v]) => v && typeof v === "object" && "body" in v) ?? [];
if (!d) throw new Error(`${file} exports no diagram`);
const cls = id.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

const inRange = (range, step) => {
  const m = range.trim().match(/^(\d*)\s*(-?)\s*(\d*)$/);
  if (!m) return false;
  const lo = m[1] ? Number(m[1]) : 1;
  const hi = m[2] ? (m[3] ? Number(m[3]) : Infinity) : lo;
  return step >= lo && step <= hi;
};
const render = (step) =>
  `<svg class="dg dg-${cls}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="x">${d.body
    .replace(/data-show="([^"]*)"/g, (all, r) => (inRange(r, step) ? `${all} data-on=""` : all))
    .replace(/data-hl="([^"]*)"/g, (all, r) => (inRange(r, step) ? `${all} data-hl-on=""` : all))}</svg>`;

const font = (pkg, f) => pathToFileURL(path.resolve("node_modules", pkg, "files", f)).href;
const css = fs.readFileSync("src/styles/diagrams.css", "utf8");
const page = (body) => `<!doctype html><html><head><style>
@font-face { font-family: "Archivo Variable"; src: url(${font("@fontsource-variable/archivo", "archivo-latin-wdth-normal.woff2")}); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: "IBM Plex Mono"; src: url(${font("@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff2")}); }
:root { --display: "Archivo Variable", sans-serif; --mono: "IBM Plex Mono", monospace; --c: ${process.env.ACCENT || "#d77c60"}; --night: #161311; }
body { margin: 0; background: #161311; display: flex; gap: 16px; padding: 16px; align-items: flex-start; }
.cell { width: 600px; flex: none; } .cell p { color: #d77c60; font: 600 14px var(--mono); margin: 0 0 8px; }
svg { width: 600px; height: auto; display: block; outline: 1px dashed #333; }
${css}
</style></head><body>${body}</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
const tab = await browser.newPage({ viewport: { width: 640, height: 800 } });
for (let s = 1; s <= d.steps; s++) {
  await tab.setContent(page(`<div class="cell"><p>${id} · step ${s}/${d.steps}</p>${render(s)}</div>`));
  // Let SMIL motion get going so moving parts show up mid-path.
  await tab.waitForTimeout(900);
  await tab.locator(".cell").screenshot({ path: path.join(outDir, `${cls}-step${s}.png`) });
}
await tab.setViewportSize({ width: 640 * d.steps, height: 800 });
await tab.setContent(page(Array.from({ length: d.steps }, (_, i) => `<div class="cell"><p>step ${i + 1}</p>${render(i + 1)}</div>`).join("")));
await tab.waitForTimeout(900);
await tab.screenshot({ path: path.join(outDir, `${cls}-all.png`), fullPage: true });
await browser.close();
console.log(`Wrote ${d.steps + 1} images for "${id}" to ${outDir}`);
