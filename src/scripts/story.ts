// Scroll-driven diagrams (markup from src/lib/markdown/rehype-story.ts): the
// step nearest the reading line becomes current, and the diagram shows it.
import { inRange } from "../lib/diagrams/range";

function show(svg: SVGSVGElement, step: number) {
  svg.dataset.step = String(step);
  for (const el of svg.querySelectorAll<SVGElement>("[data-show]")) el.toggleAttribute("data-on", inRange(el.dataset.show!, step));
  for (const el of svg.querySelectorAll<SVGElement>("[data-hl]")) el.toggleAttribute("data-hl-on", inRange(el.dataset.hl!, step));
}

for (const story of document.querySelectorAll<HTMLElement>(".story")) {
  const svg = story.querySelector<SVGSVGElement>("svg.dg");
  const steps = [...story.querySelectorAll<HTMLElement>(".step")];
  if (!svg || !steps.length) continue;
  story.classList.add("story--live");

  const setCurrent = (el: HTMLElement) => {
    for (const s of steps) s.toggleAttribute("data-current", s === el);
    show(svg, Number(el.dataset.step));
  };
  setCurrent(steps[0]);

  // On narrow screens the diagram sits on top, so read lower down the screen.
  const narrow = matchMedia("(max-width: 900px)").matches;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(e.target as HTMLElement);
    },
    { rootMargin: narrow ? "-62% 0px -25% 0px" : "-45% 0px -45% 0px" },
  );
  for (const s of steps) io.observe(s);
}
