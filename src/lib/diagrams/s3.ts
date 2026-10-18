import type { Diagram } from "./types";

// Presigned uploads: sign, PUT straight to S3, confirm, and the two things the URL doesn't do for you.
export const s3: Diagram = {
  label:
    "Diagram: a client asks a NestJS API for a presigned URL, uploads the file straight to S3 with PUT, then asks the API to confirm, which checks S3 with HeadObject. It then shows a content-type mismatch rejected with 403, and an upload larger than the API's limit accepted.",
  steps: 5,
  width: 520,
  height: 440,
  body: `
  <style>
    .dg-s3 .api[data-hl-on] { stroke: #9f7aff; fill: #1f1a2e; }
    .dg-s3 .bkt[data-hl-on] { stroke: #9f7aff; fill: #1f1a2e; }
    .dg-s3 .bkt-bad { fill: none; stroke: transparent; }
    .dg-s3 .bkt-bad[data-hl-on] { stroke: #ff4f1a; }
    .dg-s3 .bad { fill: #ff8a5c; }
    .dg-s3 .ok { fill: #4ade80; }
    .dg-s3 .cap { fill: #ffffff; }
    .dg-s3 .size { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(.12); transition: transform 1.4s cubic-bezier(.2,.8,.2,1); }
    .dg-s3 .size[data-hl-on] { transform: none; }
  </style>
  <rect class="box" x="20" y="110" width="140" height="76"/><text class="title" x="36" y="142">Client</text><text x="36" y="166">browser</text>
  <rect class="box api" data-hl="1" x="320" y="20" width="180" height="76"/>
  <rect class="box api" data-hl="3" x="320" y="20" width="180" height="76" style="fill:none"/>
  <text class="title" x="336" y="52">NestJS API</text><text x="336" y="76">signs, confirms</text>
  <rect class="box bkt" data-hl="2-3" x="320" y="200" width="180" height="76"/>
  <rect class="box bkt-bad" data-hl="4" x="320" y="200" width="180" height="76"/>
  <text class="title" x="336" y="232">S3</text><text x="336" y="256">bucket</text>
  <path class="wire" d="M90 110V58H320"/><path class="wire" d="M90 186V238H320"/><path class="wire" d="M410 96V200"/>

  <g data-show="1">
    <text x="104" y="46">POST presign-upload</text>
    <circle class="pkt" r="8"><animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear" path="M90 110V58H320"/></circle>
    <text class="cap" x="20" y="316">API checks the DTO, then signs:</text>
    <text x="20" y="344">X-Amz-SignedHeaders=content-type;host</text>
    <text x="20" y="370">X-Amz-Expires=300</text>
    <text x="20" y="396">key: uploads/&lt;user&gt;/&lt;uuid&gt;.png</text>
    <text class="small" x="20" y="424">returns uploadUrl and storageKey</text>
  </g>

  <g data-show="2">
    <text x="104" y="228">PUT file bytes</text>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" repeatCount="indefinite" path="M90 186V238H320"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-.4s" repeatCount="indefinite" path="M90 186V238H320"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-.8s" repeatCount="indefinite" path="M90 186V238H320"/></circle>
    <circle class="pkt" r="7"><animateMotion dur="1.6s" begin="-1.2s" repeatCount="indefinite" path="M90 186V238H320"/></circle>
    <text class="cap" x="20" y="316">S3 recomputes the signature</text>
    <text x="20" y="344">match: <tspan class="ok">200 OK</tspan></text>
    <text x="20" y="370">no file bytes pass through the API</text>
    <text class="small" x="20" y="400">no AWS credentials on the client</text>
  </g>

  <g data-show="3">
    <text x="104" y="46">POST confirm-upload</text>
    <text x="420" y="152">HeadObject</text>
    <circle class="pkt" r="8"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.8;1" calcMode="linear" path="M90 110V58H320M410 96V200"/></circle>
    <text class="cap" x="20" y="316">object exists, size &gt; 0:</text>
    <text class="ok" x="20" y="344">VERIFIED, save the record</text>
    <text class="small" x="20" y="380">existence is not integrity: verify a checksum too</text>
  </g>

  <g data-show="4">
    <text x="104" y="228">PUT, wrong header</text>
    <circle class="pkt" r="8" style="fill:#ff4f1a"><animateMotion dur="2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.7;1" calcMode="linear" path="M90 186V238H310"/></circle>
    <text x="20" y="316">signed:</text><text x="100" y="316">image/jpeg</text>
    <text x="20" y="342">sent:</text><text x="100" y="342">image/jpeg; charset=binary</text>
    <text class="bad" x="20" y="374">403 SignatureDoesNotMatch</text>
    <text class="small" x="20" y="406">the client echoes the API's content type, not file.type</text>
  </g>

  <g data-show="5">
    <text x="104" y="212">PUT, much larger</text>
    <circle class="pkt" r="13"><animateMotion dur="2.2s" repeatCount="indefinite" path="M90 186V238H320"/></circle>
    <text x="20" y="316">fileSizeBytes is checked by the DTO,</text>
    <text x="20" y="340">then thrown away</text>
    <rect x="20" y="356" width="480" height="16" fill="#26262b"/><rect class="size" data-hl="5" x="20" y="356" width="480" height="16" fill="#ff8a5c"/>
    <path d="M78 350V378" stroke="#ffffff" stroke-width="2"/>
    <text class="small" x="84" y="392">DTO limit</text>
    <text class="bad" x="20" y="424">same signature, bigger object: accepted</text>
  </g>
  `,
};
