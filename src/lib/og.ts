/**
 * Social preview cards (1200x630 PNG), generated at build time in the
 * magazine style: the pillar colour, the headline in heavy capitals, a black
 * footer band. Satori lays out the card and resvg rasterises it; both run
 * only during the build. Satori can't read WOFF2 or variable fonts, so the
 * static WOFF files of Archivo and IBM Plex Mono are used.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const file = (path: string) => fs.readFileSync(require.resolve(path));

let fonts: { name: string; data: Buffer; weight: 500 | 900; style: "normal" }[] | undefined;

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({
  type,
  props: { style, children },
});

export interface CardInput {
  kicker: string;
  title: string;
  /** Background; the text on it is `ink`. */
  fill?: string;
  ink?: string;
  footer?: string;
}

export async function renderCard({ kicker, title, fill = "#1b1814", ink = "#f4f0e7", footer = "prayashmishra.com" }: CardInput): Promise<Buffer> {
  fonts ??= [
    { name: "Archivo", data: file("@fontsource/archivo/files/archivo-latin-900-normal.woff"), weight: 900, style: "normal" },
    { name: "Plex", data: file("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff"), weight: 500, style: "normal" },
  ];
  const titleSize = title.length > 60 ? 64 : title.length > 36 ? 80 : 96;

  const card = h(
    "div",
    { width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: fill, color: ink },
    [
      h("div", { display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, padding: "56px 64px 44px" }, [
        h("div", { display: "flex", fontFamily: "Plex", fontSize: 26, letterSpacing: 2, textTransform: "uppercase" }, kicker),
        h(
          "div",
          { display: "flex", fontFamily: "Archivo", fontWeight: 900, fontSize: titleSize, lineHeight: 0.92, letterSpacing: -2, textTransform: "uppercase" },
          title,
        ),
      ]),
      h(
        "div",
        { display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1b1814", color: "#f4f0e7", padding: "22px 64px", fontFamily: "Plex", fontSize: 24 },
        [
          h("div", { display: "flex", fontFamily: "Archivo", fontWeight: 900, fontSize: 30 }, [
            h("span", {}, "PRAYASH"),
            h("span", { color: "#d77c60" }, "/"),
            h("span", {}, "MISHRA"),
          ]),
          h("div", {}, footer),
        ],
      ),
    ],
  );

  const svg = await satori(card as never, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
