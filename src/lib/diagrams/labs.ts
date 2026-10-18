/**
 * Interactive labs: static markup expanded into a post by rehypeStories and
 * made interactive by src/scripts/labs.ts. Without JS the lab shows its
 * intro text and nothing else; the post's own text carries the argument.
 */
export const LABS: Record<string, string> = {
  // The outbox ghost row: the same sequence as the post's reproduction.
  "ghost-row": `
<section class="lab" data-lab="ghost-row" aria-label="Lab: the ghost row">
  <div class="lab__h">
    <span>Lab · ghost row</span>
    <div class="lab__tabs" role="group" aria-label="Relay query">
      <button type="button" data-mode="cursor" aria-pressed="true">id &gt; last_seen</button>
      <button type="button" data-mode="status" aria-pressed="false">status = pending</button>
    </div>
  </div>
  <div class="lab__b">
    <div class="lab__col"><p class="lab__col-h">outbox table</p><div class="lab__rows" data-rows></div></div>
    <div class="lab__col"><p class="lab__col-h">session log</p><ol class="lab__log" data-log></ol></div>
  </div>
  <div class="lab__f">
    <p data-narr aria-live="polite">Two transactions insert into the outbox while the relay polls. Press Step to run it.</p>
    <span class="lab__btns"><button type="button" class="btn" data-reset>Reset</button> <button type="button" class="btn btn--solid" data-step>Step →</button></span>
  </div>
</section>`,
};
