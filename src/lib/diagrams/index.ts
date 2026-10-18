/**
 * Registry of scroll-driven diagrams, used by rehypeStories. Add a diagram
 * in its own file and list it here; see ./types.ts for the conventions.
 */
import type { Diagram } from "./types";
import { outbox } from "./outbox";
import { inRange } from "./range";

export { inRange };

export const DIAGRAMS: Record<string, Diagram> = {
  outbox,
};

/** The full <svg> for a diagram, rendered in its first step's state. */
export function diagramSvg(id: string, d: Diagram): string {
  const body = d.body
    .replace(/data-show="([^"]*)"/g, (all, r) => (inRange(r, 1) ? `${all} data-on=""` : all))
    .replace(/data-hl="([^"]*)"/g, (all, r) => (inRange(r, 1) ? `${all} data-hl-on=""` : all));
  return `<svg class="dg dg-${id}" viewBox="0 0 ${d.width} ${d.height}" data-step="1" data-anim role="img" aria-label="${d.label.replace(/"/g, "&quot;")}">${body}</svg>`;
}
