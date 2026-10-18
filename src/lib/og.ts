/**
 * Social preview cards (1200x630 PNG), generated at build time. Satori lays
 * out the card and resvg rasterises it; both run only during the build.
 * Satori can't read WOFF2, so the static WOFF files of Source Serif 4 are used.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const font = (weight: 400 | 700) =>
  fs.readFileSync(require.resolve(`@fontsource/source-serif-4/files/source-serif-4-latin-${weight}-normal.woff`));

let fonts: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | undefined;

const PAPER = "#faf8f4";
const INK = "#1d1b18";
const MUTED = "#6a6359";
const ACCENT = "#a3261b";

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

export interface CardInput {
  kicker: string;
  title: string;
  footer?: string;
}

export async function renderCard({ kicker, title, footer = "prayashmishra.com" }: CardInput): Promise<Buffer> {
  fonts ??= [
    { name: "Source Serif 4", data: font(400), weight: 400, style: "normal" },
    { name: "Source Serif 4", data: font(700), weight: 700, style: "normal" },
  ];
  const titleSize = title.length > 90 ? 52 : title.length > 60 ? 58 : 66;

  const card = h(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: PAPER,
      borderTop: `10px solid ${ACCENT}`,
      padding: "64px 80px 56px",
      fontFamily: "Source Serif 4",
    },
    [
      h("div", { display: "flex", flexDirection: "column" }, [
        h("div", { fontSize: 30, color: MUTED, marginBottom: 28 }, kicker),
        h("div", { fontSize: titleSize, fontWeight: 700, color: INK, lineHeight: 1.12, letterSpacing: -0.5 }, title),
      ]),
      h("div", { display: "flex", justifyContent: "space-between", fontSize: 28, color: MUTED }, [
        h("div", {}, "Prayash Mishra"),
        h("div", {}, footer),
      ]),
    ],
  );

  const svg = await satori(card as never, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
