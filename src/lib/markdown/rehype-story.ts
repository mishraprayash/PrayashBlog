/**
 * Turns story blocks in a post into a scroll-driven diagram:
 *
 *   <div class="story" data-diagram="outbox">
 *
 *   1. **Two systems, no shared commit.** The order commits to Postgres...
 *   2. **One transaction, then a relay.** ...
 *
 *   </div>
 *
 * Each list item becomes a step, its leading bold text the step's title, and
 * the diagram (src/lib/diagrams) is drawn next to the steps. As the reader
 * scrolls, src/scripts/story.ts moves the diagram to the step in view.
 *
 * Also expands `<div class="lab" data-lab="…"></div>` into the markup of an
 * interactive lab (src/lib/diagrams/labs.ts), which src/scripts/labs.ts wires up.
 *
 * Runs before rehype-raw, so the wrapper <div> arrives as two raw nodes with
 * the parsed list between them.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { VFile } from "vfile";
import { DIAGRAMS, diagramSvg } from "../diagrams";
import { LABS } from "../diagrams/labs";

const OPEN = /^\s*<div class="story" data-diagram="([a-z0-9-]+)">\s*$/;
const CLOSE = /^\s*<\/div>\s*$/;
const LAB = /^\s*<div class="lab" data-lab="([a-z0-9-]+)"><\/div>\s*$/;

type Raw = { type: "raw"; value: string };
const isRaw = (n: RootContent | undefined): n is RootContent & Raw => (n as { type?: string } | undefined)?.type === "raw";

const el = (tagName: string, properties: Element["properties"], children: ElementContent[] = []): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

export function rehypeStories() {
  return (tree: Root, file: VFile) => {
    const kids = tree.children;
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      if (!isRaw(node)) continue;

      const lab = node.value.match(LAB);
      if (lab) {
        const html = LABS[lab[1]];
        if (!html) throw new Error(`${file.path}: unknown lab "${lab[1]}"`);
        (node as Raw).value = html;
        continue;
      }

      const open = node.value.match(OPEN);
      if (!open) continue;
      const id = open[1];
      const diagram = DIAGRAMS[id];
      if (!diagram) throw new Error(`${file.path}: unknown diagram "${id}" (see src/lib/diagrams/index.ts)`);

      const end = kids.findIndex((n, j) => j > i && isRaw(n) && CLOSE.test((n as Raw).value));
      if (end === -1) throw new Error(`${file.path}: story "${id}" has no closing </div>`);
      const list = kids.slice(i + 1, end).find((n): n is Element => n.type === "element" && n.tagName === "ol");
      if (!list) throw new Error(`${file.path}: story "${id}" needs a numbered list of steps`);

      const items = list.children.filter((c): c is Element => c.type === "element" && c.tagName === "li");
      if (items.length !== diagram.steps) {
        throw new Error(`${file.path}: story "${id}" has ${items.length} steps; the diagram draws ${diagram.steps}`);
      }

      const steps = items.map((li, n) => step(li, n + 1));
      const figure = el("figure", { className: ["story"], dataDiagram: id }, [
        el("ol", { className: ["story__steps"] }, steps),
        el("div", { className: ["story__fig"] }, [
          el("div", { className: ["story__frame"] }, [{ type: "raw", value: diagramSvg(id, diagram) } as unknown as ElementContent]),
        ]),
      ]);
      kids.splice(i, end - i + 1, figure);
    }
  };
}

/** One list item → one step: a label, a title from the leading bold text, the rest. */
function step(li: Element, n: number): Element {
  // Tight lists have inline children straight in the <li>; give them a <p>.
  let body = li.children.filter((c) => !(c.type === "text" && !c.value.trim()));
  if (!body.some((c) => c.type === "element" && c.tagName === "p")) body = [el("p", {}, body)];

  const first = body[0];
  let title: Element | undefined;
  if (first?.type === "element" && first.tagName === "p") {
    const lead = first.children[0];
    if (lead?.type === "element" && lead.tagName === "strong") {
      first.children.shift();
      const next = first.children[0];
      if (next?.type === "text") next.value = next.value.replace(/^\s+/, "");
      const last = lead.children[lead.children.length - 1];
      if (last?.type === "text") last.value = last.value.replace(/[.:]\s*$/, "");
      title = el("p", { className: ["step__t"] }, lead.children);
    }
  }

  return el("li", { className: ["step"], dataStep: String(n) }, [
    el("p", { className: ["step__label"] }, [{ type: "text", value: `Step ${String(n).padStart(2, "0")}` }]),
    ...(title ? [title] : []),
    ...body,
  ]);
}
