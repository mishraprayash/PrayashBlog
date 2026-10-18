/**
 * Code themes built from the page's own palette. Every foreground was checked
 * for >= 4.5:1 against the code background (see docs/redesign/04-design-system.md);
 * none of the bundled Shiki light themes passed on this paper colour.
 */
import type { ThemeRegistration } from "shiki";

interface Palette {
  bg: string;
  fg: string;
  comment: string;
  keyword: string;
  string: string;
  number: string;
  func: string;
  type: string;
  punct: string;
}

function theme(name: string, type: "light" | "dark", c: Palette): ThemeRegistration {
  return {
    name,
    type,
    colors: { "editor.background": c.bg, "editor.foreground": c.fg },
    tokenColors: [
      { settings: { foreground: c.fg } },
      { scope: ["comment", "punctuation.definition.comment", "string.comment"], settings: { foreground: c.comment, fontStyle: "italic" } },
      {
        scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.operator.new", "keyword.operator.expression", "keyword.control", "variable.language", "keyword.other"],
        settings: { foreground: c.keyword },
      },
      { scope: ["string", "string.quoted", "string.template", "string.regexp", "markup.inline.raw"], settings: { foreground: c.string } },
      { scope: ["constant", "constant.numeric", "constant.language", "constant.character", "support.constant", "variable.other.constant"], settings: { foreground: c.number } },
      { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function", "variable.function"], settings: { foreground: c.func } },
      {
        scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class", "entity.name.tag", "storage.type.primitive"],
        settings: { foreground: c.type },
      },
      { scope: ["entity.other.attribute-name", "support.type.property-name", "meta.object-literal.key"], settings: { foreground: c.fg } },
      { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: c.punct } },
      { scope: ["markup.heading", "markup.bold"], settings: { foreground: c.keyword, fontStyle: "bold" } },
      { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
      { scope: ["markup.inserted"], settings: { foreground: c.string } },
      { scope: ["markup.deleted"], settings: { foreground: c.keyword } },
    ],
  };
}

export const notebookLight = theme("notebook-light", "light", {
  bg: "#f3efe7",
  fg: "#1d1b18",
  comment: "#6a6359",
  keyword: "#a3261b",
  string: "#2e6a3a",
  number: "#855600",
  func: "#2f5b8a",
  type: "#6a3d8f",
  punct: "#45403a",
});

export const notebookDark = theme("notebook-dark", "dark", {
  bg: "#211e1b",
  fg: "#ece7de",
  comment: "#a69e91",
  keyword: "#f08a73",
  string: "#8cc79a",
  number: "#e2b65e",
  func: "#8db6e3",
  type: "#c9a7eb",
  punct: "#cfc8bc",
});
