import type { Diagram } from "./types";

// Worker pool of 50 concurrency slots, drawn as a 10 x 5 grid.
const slots = Array.from({ length: 50 }, (_, i) => {
  const x = 272 + (i % 10) * 22;
  const y = 74 + Math.floor(i / 10) * 22;
  return `<rect class="cslot" data-hl="4" x="${x}" y="${y}" width="18" height="18" style="transition-delay:${(i * 0.02).toFixed(2)}s"/>`;
}).join("");

// Dispatch: the growing switch, the strategy registry, then the queue traps:
// the poison pill, slow webhook starvation, and separate queues per channel.
export const dispatch: Diagram = {
  label:
    "Diagram: a notification service's switch statement grows a case per channel. A registry maps each channel to its own strategy, behind validation. Then three queue traps: an invalid job retried until it is sent to a dead letter queue, slow webhooks filling all 50 worker slots while emails wait, and separate email and webhook queues.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-dispatch .new { fill: rgb(255 79 26 / .18); stroke: #ff4f1a; stroke-width: 1.5; }
    .dg-dispatch .ok { stroke: #00b874; }
    .dg-dispatch .add { fill: #1c1c20; stroke: #00b874; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .dg-dispatch .bad { fill: rgb(255 79 26 / .25); stroke: #ff4f1a; stroke-width: 1; }
    .dg-dispatch .mail { fill: rgb(0 184 116 / .2); stroke: #00b874; stroke-width: 1; }
    .dg-dispatch .pre { white-space: pre; }
    .dg-dispatch .cslot { fill: #26262b; transition: fill .3s; }
    .dg-dispatch .cslot[data-hl-on] { fill: #ff4f1a; }
  </style>

  <!-- step 1: the switch -->
  <g data-show="1">
    <rect class="box" x="20" y="40" width="140" height="62"/>
    <text class="title" x="34" y="66">Event</text><text x="34" y="88">payload: any</text>
    <path class="wire" d="M160 71H190"/>
    <circle class="pkt" r="8"><animateMotion dur="2s" repeatCount="indefinite" path="M160 71H190"/></circle>
    <rect class="box" data-hl="1" x="190" y="30" width="310" height="262"/>
    <text class="title" x="206" y="58">NotificationService</text>
    <text x="206" y="88">switch (event.channel)</text>
    <text class="pre" x="222" y="116">EMAIL   → sendGrid</text>
    <text class="pre" x="222" y="142">SMS     → twilio</text>
    <text class="pre" x="222" y="168">WEBHOOK → axios.post</text>
    <text class="pre" x="222" y="194">SLACK   → slackClient</text>
    <rect class="new" x="212" y="208" width="272" height="30"/>
    <text x="222" y="228">DISCORD → ?</text>
    <text class="small" x="212" y="264">new channel: edit and redeploy</text>
    <text class="small" x="212" y="280">this file, next to the emails</text>
    <text x="20" y="340">every SDK in one class</text>
    <text x="20" y="364">every payload checked by hand</text>
    <text x="20" y="388" style="fill:#ff8a5c">a slow webhook stalls the rest</text>
  </g>

  <!-- step 2: validation and the registry -->
  <g data-show="2">
    <rect class="box" x="20" y="40" width="140" height="62"/>
    <text class="title" x="34" y="66">Request</text><text x="34" y="88">or job</text>
    <path class="wire" d="M90 102V140"/>
    <rect class="box ok" x="20" y="140" width="140" height="62"/>
    <text class="title" x="34" y="166">Validation</text><text class="small" x="34" y="188">DTO per channel</text>
    <path class="wire" d="M90 202V250"/>
    <text x="20" y="268" style="fill:#ff8a5c">invalid → 400</text>
    <text class="small" x="20" y="288">before any strategy runs</text>
    <path class="wire" d="M160 171H190"/>
    <rect class="box" data-hl="2" x="190" y="40" width="140" height="300"/>
    <text class="title" x="204" y="66">Registry</text>
    <text class="small" x="204" y="86">Map lookup</text>
    <text x="204" y="125">EMAIL</text><text x="204" y="185">SMS</text><text x="204" y="245">WEBHOOK</text>
    <path class="wire" d="M276 120H350M276 180H350M276 240H350"/>
    <rect class="box" x="350" y="96" width="150" height="48"/><text class="title" x="362" y="125">EmailStrategy</text>
    <rect class="box" x="350" y="156" width="150" height="48"/><text class="title" x="362" y="185">SmsStrategy</text>
    <rect class="box" x="350" y="216" width="150" height="48"/><text class="title" x="362" y="245">WebhookStrategy</text>
    <rect class="add" x="350" y="296" width="150" height="48"/><text class="title" x="362" y="325" style="fill:#4ade80">new strategy</text>
    <path class="wire" d="M330 320H350" style="stroke:#1d6b4b"/>
    <circle class="pkt" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M160 171H190M276 180H350"/></circle>
    <text x="20" y="392">a new channel is a new class;</text>
    <text x="20" y="414">the dispatcher stays the same</text>
  </g>

  <!-- step 3: poison pill -->
  <g data-show="3">
    <rect class="box" x="20" y="40" width="200" height="90"/>
    <text class="title" x="36" y="66">Queue</text>
    <rect class="bad" x="36" y="84" width="140" height="28"/><text x="46" y="103" style="fill:#ff8a5c">bad payload</text>
    <rect class="box" data-hl="3" x="300" y="40" width="200" height="90"/>
    <text class="title" x="316" y="66">Worker</text><text x="316" y="90">throws</text>
    <text x="440" y="108" style="font:900 30px var(--display);fill:#ff4f1a">✕</text>
    <path class="wire" d="M220 70H300M300 110H220" style="stroke:#7a3420"/>
    <circle class="pkt" r="7"><animateMotion dur="2s" repeatCount="indefinite" path="M220 70H300V110H220Z"/></circle>
    <text x="196" y="160" style="fill:#ff8a5c">retry, fail, retry…</text>
    <text class="small" x="196" y="180">5 attempts, CPU and db spent</text>
    <path class="wire" d="M400 130V250" style="stroke:#1d6b4b"/>
    <circle r="7" style="fill:#4ade80"><animateMotion dur="2s" repeatCount="indefinite" path="M400 130V250"/></circle>
    <text class="small" x="408" y="204">validateOrReject</text>
    <rect class="box ok" x="300" y="250" width="200" height="70"/>
    <text class="title" x="316" y="278">Dead letter queue</text><text x="316" y="302">zero retries</text>
    <text x="20" y="372">validate in the worker too:</text>
    <text x="20" y="396">a job that can never pass</text>
    <text x="20" y="420">goes straight to the DLQ</text>
  </g>

  <!-- step 4: slow webhook starvation -->
  <g data-show="4">
    <rect class="box" x="20" y="20" width="220" height="200"/>
    <text class="title" x="36" y="46">Shared queue</text>
    <rect class="bad" x="36" y="62" width="188" height="24"/><text class="tag" x="46" y="78" style="fill:#ff8a5c">webhook × 50, up to 30 s</text>
    <rect class="mail" x="36" y="96" width="188" height="24"/><text class="tag" x="46" y="112" style="fill:#4ade80">password reset email</text>
    <rect class="mail" x="36" y="128" width="188" height="24"/><text class="tag" x="46" y="144" style="fill:#4ade80">password reset email</text>
    <text class="small" x="36" y="180">emails wait their turn</text>
    <text class="small" x="36" y="198">(~100 ms of work each)</text>
    <path class="wire" d="M240 74H260"/>
    <rect class="box" data-hl="4" x="260" y="20" width="240" height="200"/>
    <text class="title" x="272" y="46">Worker pool</text><text class="small" x="272" y="64">concurrency 50</text>
    ${slots}
    <text class="small" x="272" y="206">all 50 slots: slow webhooks</text>
    <text x="20" y="270">one pool for every channel</text>
    <text x="20" y="294">means the slowest endpoint</text>
    <text x="20" y="318">sets the pace for all of them</text>
    <text x="20" y="360" style="fill:#ff8a5c">password resets stop</text>
  </g>

  <!-- step 5: separate queues -->
  <g data-show="5">
    <rect class="box" x="20" y="40" width="220" height="70"/>
    <text class="title" x="36" y="66">Queue</text><text x="36" y="92">notifications-email</text>
    <rect class="box ok" x="300" y="40" width="200" height="70"/>
    <text class="title" x="316" y="66">Email workers</text><text x="316" y="92" style="fill:#4ade80">keep sending</text>
    <path class="wire" d="M240 75H300"/>
    <circle r="7" style="fill:#4ade80"><animateMotion dur=".9s" repeatCount="indefinite" path="M240 75H300"/></circle>
    <rect class="box" x="20" y="170" width="220" height="70"/>
    <text class="title" x="36" y="196">Queue</text><text x="36" y="222">notifications-webhook</text>
    <rect class="box" data-hl="5" x="300" y="170" width="200" height="70"/>
    <text class="title" x="316" y="196">Webhook workers</text><text x="316" y="222">5 s timeout</text>
    <path class="wire" d="M240 205H300"/>
    <circle class="pkt" r="7"><animateMotion dur="3.6s" repeatCount="indefinite" path="M240 205H300"/></circle>
    <text x="20" y="300">a slow customer endpoint only</text>
    <text x="20" y="324">fills the webhook workers</text>
    <text class="small" x="20" y="360">fast channels (email, SMS) and</text>
    <text class="small" x="20" y="378">slow external endpoints never</text>
    <text class="small" x="20" y="396">share concurrency</text>
  </g>
  `,
};
