/**
 * Small rehype plugins for the post body. Each one turns plain markdown output
 * into the components described in docs/redesign/04-design-system.md, at build
 * time, so the page ships no extra JS for them.
 */
import type { Element, ElementContent, Root, Text } from "hast";
import type { ShikiTransformer } from "shiki";
import { SKIP, visit } from "unist-util-visit";

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
      return [SKIP, index + 1];
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

const UNNUMBERED = /^(summary|further reading|what'?s next|what comes next|the takeaway|where to start|series wrap-up|production rules)/i;

/**
 * Section labels ("01", "02" …) above each h2, shown by CSS from `data-n`.
 * A post that numbers its own headings ("## 1. The poller") keeps its numbers,
 * moved from the text into the label; otherwise h2s are counted, skipping
 * closing sections such as "Summary". Runs after rehypeHeadingIds, so ids
 * (and links to them) don't change.
 */
export function rehypeSectionNumbers() {
  return (tree: Root) => {
    const h2s: Element[] = [];
    visit(tree, "element", (node) => {
      if (node.tagName === "h2") h2s.push(node);
    });
    const manual = h2s.some((h) => /^\s*\d+\.\s/.test(toText(h)));
    let n = 0;
    for (const h of h2s) {
      const first = h.children[0];
      if (manual) {
        const m = first?.type === "text" ? first.value.match(/^\s*(\d+)\.\s+/) : null;
        if (!m || first?.type !== "text") continue;
        first.value = first.value.slice(m[0].length);
        h.properties.dataN = m[1].padStart(2, "0");
      } else if (!UNNUMBERED.test(toText(h).trim())) {
        h.properties.dataN = String(++n).padStart(2, "0");
      }
    }
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
 * miss on a preview. `npm run todos` lists them all. A placeholder may contain
 * inline markup (`code`, links), so it can span several sibling nodes.
 */
export function rehypeTodos() {
  return (tree: Root) => {
    visit(tree, "element", (parent) => {
      if (parent.tagName === "mark" || parent.tagName === "code" || parent.tagName === "pre") return;
      const kids = parent.children;
      for (let i = 0; i < kids.length; i++) {
        const node = kids[i];
        if (node.type !== "text") continue;
        const start = node.value.indexOf("[TODO");
        if (start === -1) continue;

        // Find the closing "]", in this node or a later text sibling.
        let endIdx = i;
        let endAt = node.value.indexOf("]", start);
        while (endAt === -1 && ++endIdx < kids.length) {
          const k = kids[endIdx];
          endAt = k.type === "text" ? k.value.indexOf("]") : -1;
        }
        if (endAt === -1) return;

        const before = node.value.slice(0, start);
        const last = kids[endIdx] as Text;
        const after = last.value.slice(endAt + 1);
        let inner: ElementContent[];
        if (endIdx === i) {
          inner = [text(node.value.slice(start, endAt + 1))];
        } else {
          inner = [text(node.value.slice(start)), ...kids.slice(i + 1, endIdx), text(last.value.slice(0, endAt + 1))];
        }
        const replacement: ElementContent[] = [
          ...(before ? [text(before)] : []),
          el("mark", { className: ["todo"] }, inner),
          ...(after ? [text(after)] : []),
        ];
        kids.splice(i, endIdx - i + 1, ...replacement);
        i += before ? 1 : 0;
      }
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
