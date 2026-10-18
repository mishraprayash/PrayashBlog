---
title: "ML request filter for Nginx"
summary: "An OpenResty gatekeeper that sends each incoming request to a PyTorch classifier and blocks what it flags, before the request reaches the application."
role: "[TODO: e.g. sole developer]"
period: "[TODO: e.g. June 2026]"
status: "[TODO: prototype, or did it run in front of real traffic?]"
stack: ["Nginx / OpenResty", "Lua", "lua-resty-http", "Python", "Flask", "PyTorch", "Transformers"]
order: 2
links: []
posts:
  - "nginx-lua-ai-waf-gatekeeper"
  - "nginx-lua-ai-waf-traps-bypasses"
---

Signature-based WAF rules are fast but brittle: they miss payloads that are encoded twice, split across fields, or simply phrased differently. The idea here was to put a trained classifier on the request path instead, and see what that costs and how it breaks.

[TODO: a link to the code, if it's public.]

## How it works

Nginx terminates TLS. In the `access` phase, a Lua script snapshots the request (method, path, query, a few headers, the body) and sends it over a non-blocking cosocket to a Python service on localhost running a sequence classifier. If the score is over the threshold, Nginx returns `403` and the request never reaches the application. Otherwise it continues to `proxy_pass` as normal.

The full walkthrough, with the Nginx config, the Lua and the Python, is in [Part 1](/blog/nginx-lua-ai-waf-gatekeeper).

## What broke

Part 2 covers these in detail. In short:

- **Large bodies skipped inspection.** Bodies bigger than Nginx's in-memory buffer (8 KB by default on x86-64) are spooled to disk, and `ngx.req.get_body_data()` returns `nil`, so the gatekeeper scored an empty body.
- **Padding still worked after that was fixed.** The tokenizer truncates at 512 tokens, so anything after that is never seen by the model.
- **Every inspection opened a new connection.** The Flask dev server sends `Connection: close` on every response, which defeats connection pooling no matter what the Lua does.
- **The circuit breaker was an attack surface.** Failing open after five slow requests gives an attacker a predictable thirty-second window with no inspection.
- **Encodings slipped past the model** unless the same normalisation ran at inference as in training.

## Results

[TODO: the numbers that matter for a filter on the request path: added latency per request (p50 and p99), throughput, and how the threshold was evaluated (false positives and false negatives on a labelled set). If it was never measured, say that; Part 2 already makes that point about the 0.85 threshold.]

## What I'd do differently

[TODO: e.g. keep a deterministic rule set (OWASP CRS) underneath from day one, measure latency before anything else, fail closed for mutating endpoints.]
