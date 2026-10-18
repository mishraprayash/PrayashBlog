// Shared by the build (rehype-story) and the browser (scripts/story.ts), so
// it stays free of imports.

/** True if `step` is inside a range like "2", "2-3", "2-" or "-2". */
export function inRange(range: string, step: number): boolean {
  const m = range.trim().match(/^(\d*)\s*(-?)\s*(\d*)$/);
  if (!m) return false;
  const [, a, dash, b] = m;
  const lo = a ? Number(a) : 1;
  const hi = dash ? (b ? Number(b) : Infinity) : lo;
  return step >= lo && step <= hi;
}

