/**
 * A scroll-driven diagram. The post supplies the steps (a numbered list in
 * the markdown); the diagram supplies one SVG whose parts appear, change or
 * move as the reader scrolls from step to step.
 *
 * Inside the SVG:
 * - `data-show="2"`, `"2-3"`, `"2-"` (2 onward) or `"-2"` (up to 2): the
 *   element is visible only during those steps.
 * - `data-hl="3"` (same range syntax): the element gets `data-hl-on` during
 *   those steps; style it with `[data-hl-on]` in the diagram's CSS.
 * - Motion is SMIL (`<animateMotion>` etc.), which BaseLayout pauses when the
 *   diagram is off screen or motion is off.
 *
 * The SVG's own `<style>` must scope every rule under its root class
 * (`.dg-<id>`), because inline SVG styles apply to the whole page.
 */
export interface Diagram {
  /** What the whole diagram shows, for screen readers (the steps are text). */
  label: string;
  /** Number of steps; the build fails if the post's list has a different count. */
  steps: number;
  /** viewBox width and height. */
  width: number;
  height: number;
  /** SVG content (no outer <svg>), including a scoped <style> if needed. */
  body: string;
}
