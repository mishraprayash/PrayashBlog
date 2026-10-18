/**
 * Small rehype plugins for the post body. Each one turns plain markdown output
 * into the components described in docs/redesign/04-design-system.md, at build
 * time, so the page ships no extra JS for them.
 */
import type { Element, ElementContent, Root, Text } from "hast";
import type { ShikiTransformer } from "shiki";
import { visit } from "unist-util-visit";

const el = (tagName: string, properties: Element["properties"], children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});
const text = (value: string): Text => ({ type: "text", value });

const OUTPUT_LANGS = new Set(["console", "output", "log", "shell-session"]);
const LANG_LABELS: Record<string, string> = {
  typescript: "TypeScript", ts: "TypeScript", javascript: "JavaScript", js: "JavaScript",
  bash: "Bash", sh: "Shell", shell: "Shell", yaml: "YAML", yml: "YAML", json: "JSON",
  sql: "SQL", dockerfile: "Dockerfile", lua: "Lua", nginx: "Nginx", python: "Python",
  ini: "INI", http: "HTTP", diff: "Diff", go: "Go",
};

/**
 * Shiki transformer that wraps each highlighted <pre> in a block with a bar
 * holding the filename (from `title="…"` in the fence meta) or the language,
 * and a copy button wired up by the post page. It runs inside Shiki because
 * Shiki highlights after the rehype plugins, so a rehype plugin never sees
 * the highlighted <pre>.
 */
export function transformerCodeBlock(): ShikiTransformer {
  return {
    name: "notebook:code-block",
    root(root) {
      const pre = root.children.find((c): c is Element => c.type === "element" && c.tagName === "pre");
      if (!pre) return;

      const lang = this.options.lang ?? "text";
      const raw = this.options.meta?.__raw ?? "";
      const m = raw.match(/title=(?:"([^"]+)"|'([^']+)')/);
      const title = m ? m[1] ?? m[2] : undefined;
      const isOutput = OUTPUT_LANGS.has(lang);
      const label = isOutput ? "Output" : LANG_LABELS[lang] ?? (["plaintext", "text", "txt", ""].includes(lang) ? "" : lang);

      pre.properties.tabIndex = 0;
      pre.properties.ariaLabel = title ? `Code: ${title}` : label ? `Code (${label})` : "Code";
      // The theme's inline background would fight the CSS, which owns it.
      delete pre.properties.style;

      const bar = el("div", { className: ["code-block__bar"] }, [
        el("span", { className: ["code-block__title"] }, title ? [text(title)] : []),
        el("span", { className: ["code-block__lang"] }, label ? [text(label)] : []),
        el("button", { type: "button", className: ["code-block__copy"] }, [text("Copy")]),
      ]);
      root.children = [
        el("div", { className: ["code-block", ...(isOutput ? ["code-block--output"] : [])], dataLang: lang }, [bar, pre]),
      ];
    },
  };
}

/**
 * Wraps tables in a focusable scroll container so they never widen the page.
 * Each container is a labelled region, named after the table's column
 * headings so screen reader users can tell the tables on a page apart.
 */
export function rehypeTables() {
  return (tree: Root) => {
    const used = new Map<string, number>();
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "table" || !parent || index === undefined) return;
      if (parent.type === "element" && (parent as Element).properties.className?.toString().includes("table-wrap")) return;

      const headers: string[] = [];
      visit(node, "element", (cell) => {
        if (cell.tagName !== "th") return;
        cell.properties.scope = "col";
        headers.push(toText(cell).trim());
      });
      let label = headers.filter(Boolean).length ? `Table: ${headers.filter(Boolean).join(", ")}` : "Table";
      const seen = (used.get(label) ?? 0) + 1;
      used.set(label, seen);
      if (seen > 1) label += ` (${seen})`;

      parent.children[index] = el("div", { className: ["table-wrap"], tabIndex: 0, role: "region", ariaLabel: label }, [node]);
      return [visit.SKIP, index + 1];
    });
  };
}

const CALLOUTS: Record<string, string> = { NOTE: "Note", TIP: "Tip", IMPORTANT: "Note", CAUTION: "Caution", WARNING: "Warning" };

/**
 * GitHub-style alerts: a blockquote whose first line is `[!NOTE]`, `[!TIP]`,
 * `[!CAUTION]` or `[!WARNING]` becomes an <aside class="callout">.
 */
export function rehypeCallouts() {
  return (tree: Root) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "blockquote" || !parent || index === undefined) return;
      const firstP = node.children.find((c): c is Element => c.type === "element" && c.tagName === "p");
      const first = firstP?.children[0];
      if (!firstP || first?.type !== "text") return;
      const m = first.value.match(/^\s*\[!(NOTE|TIP|IMPORTANT|CAUTION|WARNING)\]\s*\n?/);
      if (!m) return;
      first.value = first.value.slice(m[0].length);
      if (!first.value && firstP.children[1]?.type === "element" && (firstP.children[1] as Element).tagName === "br") {
        firstP.children.splice(1, 1);
      }
      const kind = m[1] === "IMPORTANT" ? "note" : m[1].toLowerCase();
      parent.children[index] = el("aside", { className: ["callout", `callout--${kind}`] }, [
        el("p", { className: ["callout__label"] }, [text(CALLOUTS[m[1]])]),
        ...node.children,
      ]);
    });
  };
}

/** Adds a hover/focus `#` link to each h2 and h3 that has an id. */
export function rehypeHeadingAnchors() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if ((node.tagName !== "h2" && node.tagName !== "h3") || !node.properties.id) return;
      node.children.push(
        el("a", { className: ["heading-anchor"], href: `#${node.properties.id}`, ariaLabel: "Link to this section" }, [text("#")]),
      );
    });
  };
}

/**
 * Highlights `[TODO: ...]` placeholders so unfinished facts are impossible to
 * miss on a preview. `npm run todos` lists them all.
 */
export function rehypeTodos() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === undefined || !node.value.includes("[TODO")) return;
      const parts = node.value.split(/(\[TODO:[^\]]*\])/g).filter(Boolean);
      parent.children.splice(
        index,
        1,
        ...parts.map((part) => (part.startsWith("[TODO") ? el("mark", { className: ["todo"] }, [text(part)]) : text(part))),
      );
      return index + parts.length;
    });
  };
}

/**
 * GFM task lists render disabled checkboxes with no label, which screen
 * readers announce as an unlabelled form control. Label each one with the
 * item's own text.
 */
export function rehypeTaskLists() {
  return (tree: Root) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "li") return;
      const box = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "input" && c.properties.type === "checkbox",
      );
      if (!box) return;
      const label = toText(node).trim().replace(/\s+/g, " ").slice(0, 120);
      box.properties.ariaLabel = `${box.properties.checked ? "Done" : "To check"}: ${label}`;
    });
  };
}

function toText(node: Element | ElementContent): string {
  if (node.type === "text") return node.value;
  if (node.type === "element") return node.children.map(toText).join("");
  return "";
}
