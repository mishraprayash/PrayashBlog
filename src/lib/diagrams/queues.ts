import type { Diagram } from "./types";

// Queues: competing consumers, topic fan-out, a retained stream with offsets,
// topic-to-queue fan-out, and a Kafka consumer group as an ordered work queue.
export const queues: Diagram = {
  label:
    "Diagram: a queue hands each message to one of several workers; a topic copies each event to every subscriber; a stream keeps records and each consumer reads from its own offset. Then two patterns: a topic fanned out to an email queue and a billing queue, and a Kafka topic with four partitions shared by a two-worker consumer group, where a slow task blocks its partition.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-queues .chip { fill: #26262b; stroke: #3a3a40; stroke-width: 1; }
    .dg-queues .chip-a { fill: rgb(255 79 26 / .25); stroke: #ff4f1a; stroke-width: 1; }
    .dg-queues .slot { fill: #26262b; stroke: #3a3a40; stroke-width: 1; }
    .dg-queues .new { fill: rgb(0 184 116 / .2); stroke: #00b874; }
    .dg-queues .down { stroke: #ff8a5c; fill: #2a1610; }
    .dg-queues .slow { fill: rgb(255 79 26 / .25); stroke: #ff4f1a; stroke-width: 1.5; }
  </style>

  <!-- steps 1-2: one sender, one broker box, three receivers -->
  <g data-show="1-2">
    <rect class="box" x="20" y="182" width="120" height="60"/>
    <rect class="box" data-hl="1-2" x="170" y="172" width="160" height="80"/>
    <rect class="box" x="370" y="80" width="130" height="60"/>
    <rect class="box" x="370" y="182" width="130" height="60"/>
    <rect class="box" x="370" y="284" width="130" height="60"/>
    <path class="wire" d="M140 212H170"/>
    <path class="wire" d="M330 212H350V110H370M350 212H370M350 212V314H370"/>
  </g>
  <g data-show="1">
    <text class="title" x="34" y="208">Producer</text><text x="34" y="230">tasks</text>
    <text class="title" x="186" y="200">Queue</text>
    <rect class="chip" x="186" y="214" width="22" height="22"/><rect class="chip" x="214" y="214" width="22" height="22"/>
    <rect class="chip" x="242" y="214" width="22" height="22"/><rect class="chip" x="270" y="214" width="22" height="22"/>
    <text class="title" x="386" y="108">Worker 1</text><text class="small" x="386" y="128">ACK → deleted</text>
    <text class="title" x="386" y="210">Worker 2</text><text class="small" x="386" y="230">ACK → deleted</text>
    <text class="title" x="386" y="312">Worker 3</text><text class="small" x="386" y="332">ACK → deleted</text>
    <circle class="pkt" r="8" opacity="0"><animateMotion dur="3s" begin="0s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.33;1" calcMode="linear" path="M330 212H350V110H370"/><animate attributeName="opacity" values="1;0" keyTimes="0;.33" calcMode="discrete" dur="3s" begin="0s" repeatCount="indefinite"/></circle>
    <circle class="pkt" r="8" opacity="0"><animateMotion dur="3s" begin="-2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.33;1" calcMode="linear" path="M330 212H370"/><animate attributeName="opacity" values="1;0" keyTimes="0;.33" calcMode="discrete" dur="3s" begin="-2s" repeatCount="indefinite"/></circle>
    <circle class="pkt" r="8" opacity="0"><animateMotion dur="3s" begin="-1s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.33;1" calcMode="linear" path="M330 212H350V314H370"/><animate attributeName="opacity" values="1;0" keyTimes="0;.33" calcMode="discrete" dur="3s" begin="-1s" repeatCount="indefinite"/></circle>
    <text x="20" y="396">each task goes to one worker</text>
    <text class="small" x="20" y="418">competing consumers share the work</text>
  </g>
  <g data-show="2">
    <text class="title" x="34" y="208">Publisher</text><text x="34" y="230">event</text>
    <text class="title" x="186" y="200">Topic</text><text x="186" y="226">user.created</text>
    <text class="title" x="386" y="108">Subscriber</text><text class="small" x="386" y="128">copy</text>
    <text class="title" x="386" y="210">Subscriber</text><text class="small" x="386" y="230">copy</text>
    <text class="title" x="386" y="312">Subscriber</text><text class="small" x="386" y="332">copy</text>
    <circle class="pkt" r="8"><animateMotion dur="1.8s" repeatCount="indefinite" path="M330 212H350V110H370"/></circle>
    <circle class="pkt" r="8"><animateMotion dur="1.8s" repeatCount="indefinite" path="M330 212H370"/></circle>
    <circle class="pkt" r="8"><animateMotion dur="1.8s" repeatCount="indefinite" path="M330 212H350V314H370"/></circle>
    <text x="20" y="396">every subscriber gets a copy</text>
    <text class="small" x="20" y="418">the publisher doesn't know who listens</text>
  </g>

  <!-- step 3: the stream -->
  <g data-show="3">
    <rect class="box" x="380" y="30" width="120" height="60"/>
    <text class="title" x="394" y="56">Producer</text><text x="394" y="78">append</text>
    <path class="wire" d="M440 90V160"/>
    <text class="title" x="20" y="150">Stream (append-only log)</text>
    <rect class="slot" x="20" y="164" width="50" height="40"/><text x="40" y="189">0</text>
    <rect class="slot" x="72" y="164" width="50" height="40"/><text x="92" y="189">1</text>
    <rect class="slot" x="124" y="164" width="50" height="40"/><text x="144" y="189">2</text>
    <rect class="slot" x="176" y="164" width="50" height="40"/><text x="196" y="189">3</text>
    <rect class="slot" x="228" y="164" width="50" height="40"/><text x="248" y="189">4</text>
    <rect class="slot" x="280" y="164" width="50" height="40"/><text x="300" y="189">5</text>
    <rect class="slot" x="332" y="164" width="50" height="40"/><text x="352" y="189">6</text>
    <rect class="slot new" x="384" y="164" width="50" height="40"/><text x="404" y="189">7</text>
    <text class="small" x="20" y="222">offset</text>
    <path class="wire" d="M357 204V270" style="stroke:#7a3420"/>
    <circle class="pkt" r="7" cx="357" cy="214"/>
    <rect class="box" x="290" y="270" width="160" height="56"/>
    <text class="title" x="304" y="294">Service A</text><text x="304" y="314">offset 6</text>
    <path class="wire" d="M95 204V270" style="stroke:#1d6b4b"/>
    <circle r="7" cy="214" style="fill:#4ade80"><animate attributeName="cx" values="45;357" dur="4s" repeatCount="indefinite"/></circle>
    <rect class="box" x="20" y="270" width="190" height="56"/>
    <text class="title" x="34" y="294">New service</text><text x="34" y="314">replays from 0</text>
    <text x="20" y="372">records stay after they are read</text>
    <text class="small" x="20" y="394">retained by time (e.g. 7 days) or size;</text>
    <text class="small" x="20" y="412">each consumer keeps its own offset</text>
  </g>

  <!-- step 4: topic-to-queue fan-out -->
  <g data-show="4">
    <rect class="box" data-hl="4" x="150" y="20" width="220" height="62"/>
    <text class="title" x="166" y="46">SNS topic</text><text x="166" y="68">user.created</text>
    <path class="wire" d="M260 82V110H130V150M260 110H390V150"/>
    <rect class="box" x="20" y="150" width="220" height="70"/>
    <text class="title" x="36" y="176">Email queue</text><text class="small" x="36" y="200">SQS</text>
    <rect class="box" x="280" y="150" width="220" height="70"/>
    <text class="title" x="296" y="176">Billing queue</text><text class="small" x="296" y="200">SQS · buffering</text>
    <rect class="chip-a" x="408" y="188" width="16" height="22"/><rect class="chip-a" x="428" y="188" width="16" height="22"/>
    <rect class="chip-a" x="448" y="188" width="16" height="22"/><rect class="chip-a" x="468" y="188" width="16" height="22"/>
    <path class="wire" d="M130 220V290"/><path class="wire" d="M390 220V290"/>
    <rect class="box" x="20" y="290" width="220" height="62"/>
    <text class="title" x="36" y="316">Email workers</text><text x="36" y="338">50 msg/sec</text>
    <rect class="box down" x="280" y="290" width="220" height="62"/>
    <text class="title" x="296" y="316">Billing workers</text><text x="296" y="338" style="fill:#ff8a5c">5 msg/sec · db down</text>
    <circle class="pkt" r="8"><animateMotion dur="2.2s" repeatCount="indefinite" path="M260 82V110H130V290"/></circle>
    <circle class="pkt" r="8"><animateMotion dur="2.2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.6;1" calcMode="linear" path="M260 82V110H390V150"/></circle>
    <text x="20" y="396">each subscriber gets its own queue,</text>
    <text class="small" x="20" y="418">rate limit and dead letter queue</text>
  </g>

  <!-- step 5: Kafka consumer group -->
  <g data-show="5">
    <rect class="box" x="20" y="20" width="300" height="250"/>
    <text class="title" x="36" y="46">Kafka topic, 4 partitions</text>
    <text x="36" y="87">P0</text><text x="36" y="137">P1</text><text x="36" y="187">P2</text><text x="36" y="237">P3</text>
    <rect class="slot" x="80" y="68" width="28" height="28"/><rect class="slot" x="114" y="68" width="28" height="28"/><rect class="slot" x="148" y="68" width="28" height="28"/>
    <rect class="slot" x="80" y="118" width="28" height="28"/><rect class="slot" x="114" y="118" width="28" height="28"/><rect class="slot" x="148" y="118" width="28" height="28"/><rect class="slot" x="182" y="118" width="28" height="28"/>
    <rect class="slow" x="216" y="118" width="90" height="28"/><text class="tag" x="226" y="136" style="fill:#ff8a5c">slow export</text>
    <rect class="slot" x="80" y="168" width="28" height="28"/><rect class="slot" x="114" y="168" width="28" height="28"/>
    <rect class="slot" x="80" y="218" width="28" height="28"/><rect class="slot" x="114" y="218" width="28" height="28"/><rect class="slot" x="148" y="218" width="28" height="28"/>
    <rect class="box" x="350" y="20" width="150" height="250"/>
    <text class="title" x="364" y="46">ledger-workers</text>
    <rect class="box" x="364" y="62" width="122" height="90"/>
    <text class="title" x="376" y="88">Worker 1</text><text x="376" y="112">P0, P1</text>
    <rect class="box" x="364" y="166" width="122" height="90"/>
    <text class="title" x="376" y="192">Worker 2</text><text x="376" y="216">P2, P3</text>
    <path class="wire" d="M306 82H364M306 132H364M306 182H364M306 232H364"/>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" repeatCount="indefinite" path="M180 82H364"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-.5s" repeatCount="indefinite" path="M128 182H364"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-1s" repeatCount="indefinite" path="M180 232H364"/></circle>
    <text x="20" y="306">key = accountId: one account,</text>
    <text x="20" y="326">one partition, in order</text>
    <text x="20" y="370" style="fill:#ff8a5c">P1 waits behind its slow task</text>
    <text class="small" x="20" y="392">head-of-line blocking; a queue suits</text>
    <text class="small" x="20" y="410">tasks with widely varying runtimes</text>
  </g>
  `,
};
