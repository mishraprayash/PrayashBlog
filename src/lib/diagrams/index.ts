/**
 * Registry of scroll-driven diagrams, used by rehypeStories. Add a diagram
 * in its own file and list it here; see ./types.ts for the conventions.
 */
import type { Diagram } from "./types";
import { outbox } from "./outbox";
import { idempotency } from "./idempotency";
import { queues } from "./queues";
import { dispatch } from "./dispatch";
import { tls } from "./tls";
import { wafGatekeeper } from "./waf-gatekeeper";
import { wafBypass } from "./waf-bypass";
import { s3 } from "./s3";
import { dockerLayers } from "./docker-layers";
import { dockerMultistage } from "./docker-multistage";
import { k9s } from "./k9s";
import { daprSidecar } from "./dapr-sidecar";
import { daprInvoke } from "./dapr-invoke";
import { daprState } from "./dapr-state";
import { daprK8s } from "./dapr-k8s";
import { inRange } from "./range";

export { inRange };

export const DIAGRAMS: Record<string, Diagram> = {
  outbox,
  idempotency,
  queues,
  dispatch,
  tls,
  "waf-gatekeeper": wafGatekeeper,
  "waf-bypass": wafBypass,
  s3,
  "docker-layers": dockerLayers,
  "docker-multistage": dockerMultistage,
  k9s,
  "dapr-sidecar": daprSidecar,
  "dapr-invoke": daprInvoke,
  "dapr-state": daprState,
  "dapr-k8s": daprK8s,
};

/** The full <svg> for a diagram, rendered in its first step's state. */
export function diagramSvg(id: string, d: Diagram): string {
  const body = d.body
    .replace(/data-show="([^"]*)"/g, (all, r) => (inRange(r, 1) ? `${all} data-on=""` : all))
    .replace(/data-hl="([^"]*)"/g, (all, r) => (inRange(r, 1) ? `${all} data-hl-on=""` : all));
  return `<svg class="dg dg-${id}" viewBox="0 0 ${d.width} ${d.height}" data-step="1" data-anim role="img" aria-label="${d.label.replace(/"/g, "&quot;")}">${body}</svg>`;
}
