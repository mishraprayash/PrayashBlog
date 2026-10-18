// Interactive labs (markup in src/lib/diagrams/labs.ts).

function ghostRow(root: HTMLElement) {
  type State = "unc" | "pend" | "pub" | "lost";
  const LABEL: Record<State, string> = { unc: "uncommitted", pend: "pending", pub: "published", lost: "never sent" };
  const rows = root.querySelector<HTMLElement>("[data-rows]")!;
  const log = root.querySelector<HTMLElement>("[data-log]")!;
  const narr = root.querySelector<HTMLElement>("[data-narr]")!;
  const stepBtn = root.querySelector<HTMLButtonElement>("[data-step]")!;
  const modes = [...root.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  let mode: "cursor" | "status" = "cursor";
  let step = 0;

  // The sequence reproduced in the post, one line per step.
  function frame(n: number) {
    const r: Partial<Record<1 | 2, State>> = {};
    const lines: string[] = [];
    let text = "Two transactions insert into the outbox while the relay polls. Press Step to run it.";
    if (n >= 1) { r[1] = "unc"; lines.push("<b>txn A</b> INSERT → id 1 (not committed)"); text = "A inserts and gets id 1, then keeps working."; }
    if (n >= 2) { r[2] = "pend"; lines.push("<b>txn B</b> INSERT → id 2, COMMIT"); text = "B inserts id 2 and commits straight away."; }
    if (n >= 3) {
      r[2] = "pub";
      lines.push(mode === "cursor" ? "<b>relay</b> WHERE id &gt; 0 → [2] · last_seen = 2" : "<b>relay</b> WHERE status = 'PENDING' → [2]");
      text = "The relay can only see committed rows. It publishes 2.";
    }
    if (n >= 4) { r[1] = "pend"; lines.push("<b>txn A</b> COMMIT → row 1 visible"); text = "A commits. Row 1 appears, with an id below one the relay has already passed."; }
    if (n >= 5) {
      if (mode === "cursor") {
        r[1] = "lost";
        lines.push("<b>relay</b> WHERE id &gt; 2 → 0 rows");
        text = "Row 1 is never returned, and nothing errors. Switch the query and run it again.";
      } else {
        r[1] = "pub";
        lines.push("<b>relay</b> WHERE status = 'PENDING' → [1]");
        text = "Row 1 is still pending, so it goes out. Nothing lost.";
      }
    }
    return { r, lines, text };
  }

  function draw() {
    const f = frame(step);
    const ids = ([1, 2] as const).filter((i) => f.r[i]);
    rows.innerHTML = ids.length
      ? ids.map((i) => `<div class="trow trow--${f.r[i]}"><span>id ${i}</span><span>order ${i === 1 ? "A" : "B"}</span><span class="trow__st">${LABEL[f.r[i]!]}</span></div>`).join("")
      : `<div class="trow trow--unc"><span>—</span><span>empty</span><span></span></div>`;
    log.innerHTML = f.lines.map((l) => `<li>${l}</li>`).join("");
    narr.textContent = f.text;
    stepBtn.disabled = step >= 5;
  }

  stepBtn.addEventListener("click", () => { step = Math.min(5, step + 1); draw(); });
  root.querySelector("[data-reset]")!.addEventListener("click", () => { step = 0; draw(); stepBtn.focus(); });
  for (const b of modes) {
    b.addEventListener("click", () => {
      mode = b.dataset.mode as typeof mode;
      for (const x of modes) x.setAttribute("aria-pressed", String(x === b));
      step = 0;
      draw();
    });
  }
  draw();
}

const LABS: Record<string, (root: HTMLElement) => void> = { "ghost-row": ghostRow };
for (const root of document.querySelectorAll<HTMLElement>(".lab[data-lab]")) {
  LABS[root.dataset.lab!]?.(root);
  root.classList.add("lab--ready");
}
