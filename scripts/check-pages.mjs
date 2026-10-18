// Checks every built page at 360, 1280, 1440 and 1920px: no horizontal
// scroll, nothing covering the contents rail, no JS errors, exactly one <h1>,
// and no axe violations in light or dark mode.
// Run after `npm run build`:  npm run test:pages
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = path.resolve("dist");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml", ".xml": "application/xml" };

const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  else if (!path.extname(file)) file += "/index.html";
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const pages = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f === "index.html" || f === "404.html") pages.push("/" + path.relative(root, p).replace(/index\.html$/, ""));
  }
})(root);

// Uses the browser Playwright manages, or CHROMIUM_PATH if set.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const failures = [];

const VIEWPORTS = [[360, 740, "light"], [1280, 800, "light"], [1440, 900, "dark"], [1920, 1080, "light"]];
for (const [width, height, scheme] of VIEWPORTS) {
  const page = await (await browser.newContext({ viewport: { width, height }, colorScheme: scheme })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const url of pages) {
    errors.length = 0;
    await page.goto(base + url, { waitUntil: "load" });
    // Check the settled page: reveal every scroll-in block and let the
    // entrance animations (titles, reveals) finish before measuring contrast.
    await page.evaluate(() => document.querySelectorAll(".rv").forEach((el) => el.classList.add("in")));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: document.querySelectorAll("h1").length,
      // Nothing in the post body may reach into the contents rail.
      overlap: (() => {
        const rail = document.querySelector(".toc--rail");
        if (!rail || getComputedStyle(rail).display === "none") return [];
        const edge = rail.getBoundingClientRect().right;
        return [...document.querySelectorAll(".post-body > *")]
          .filter((el) => el.getBoundingClientRect().left < edge)
          .map((el) => el.className || el.tagName.toLowerCase());
      })(),
    }));
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () =>
      (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } }))
        .violations.map((v) => `${v.id} (${v.nodes.length})`),
    );
    const where = `${width}px ${scheme} ${url}`;
    if (r.overflow > 0) failures.push(`${where}: page scrolls sideways by ${r.overflow}px`);
    for (const o of r.overlap) failures.push(`${where}: "${o}" covers the contents rail`);
    if (r.h1 !== 1) failures.push(`${where}: ${r.h1} <h1> elements`);
    for (const e of errors) failures.push(`${where}: JS error: ${e}`);
    for (const v of violations) failures.push(`${where}: axe ${v}`);
  }
}

await browser.close();
server.close();
console.log(failures.length ? failures.join("\n") : `OK: ${pages.length} pages at ${VIEWPORTS.map(([w, , s]) => `${w}px ${s}`).join(", ")}.`);
process.exit(failures.length ? 1 : 0);
