/**
 * Code theme built from the site palette. Every foreground was checked for
 * >= 4.5:1 against the code background (see docs/redesign/04-design-system.md).
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

/** The only code theme: code always sits on a dark "press" panel, in both
 * site themes. Line highlights use #26201c, which the comment colour also
 * clears (4.79:1). */
export const pressTheme = theme("press", "dark", {
  bg: "#141416",
  fg: "#e8e6df",
  comment: "#8f8c85",
  keyword: "#ff8a5c",
  string: "#8ee0a8",
  number: "#ffc66d",
  func: "#8fb0ff",
  type: "#c9a7eb",
  punct: "#b9b6ae",
});
