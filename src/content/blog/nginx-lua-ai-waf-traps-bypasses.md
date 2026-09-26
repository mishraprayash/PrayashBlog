---
title: "Part 2: Building an AI-Powered WAF on Nginx – Traps, Bypasses, and Hardening"
slug: "nginx-lua-ai-waf-traps-bypasses"
description: "The hard lessons learned deploying an AI WAF: the silent get_body_data() disk-spill bypass, ephemeral socket exhaustion, zero-latency shared-memory circuit breakers, and adversarial evasion."
publishDate: "2026-06-29T10:00:00Z"
author: "Prayash Mishra"
tags: ["nginx", "lua", "waf", "security", "ml"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Nginx Lua AI WAF edge cases, circuit breaker, and disk spillage diagram"
draft: false
---

In **[Part 1](/blog/nginx-lua-ai-waf-gatekeeper)**, we built the working prototype: Nginx terminating TLS, extracting request snapshots in `access_by_lua`, querying a Python PyTorch sidecar via cosockets, and blocking attacks with a `403 Forbidden`.

The prototype worked cleanly in local development. But when running load tests and fuzzing the perimeter, four critical production failure modes emerged: **a silent security bypass on large payloads, ephemeral socket exhaustion, cascading latency spikes, and adversarial encoding evasion**.

Here is how each problem manifested and how to harden the system for production.

---

## 1. The Silent WAF Bypass: The `get_body_data()` Disk Spill

This was the most critical vulnerability I uncovered during penetration testing.

In the Part 1 prototype, we extracted the request body in Lua like this:

```lua
-- ❌ VULNERABILITY: Bypassed when payloads exceed 16KB!
local body = ngx.req.get_body_data() or ""
```

### The Mechanism
Nginx allocates a small in-memory buffer (`client_body_buffer_size`, default 8KB or 16KB on 64-bit systems) to hold incoming request bodies. 

When a request body is small, Nginx stores it entirely in RAM, and `ngx.req.get_body_data()` returns the string.

However, if a request body exceeds 16KB, Nginx flushes the excess bytes into a temporary file on disk (under `/var/lib/nginx/body/...`). When this occurs, **`ngx.req.get_body_data()` returns `nil`!**

### The Exploit
An attacker can bypass the entire AI firewall simply by padding their exploit with 20KB of junk comments or whitespace:

```http
POST /api/v1/query HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 20540

{
  "padding": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA... (20KB of padding)",
  "query": "SELECT * FROM users WHERE admin = 1; DROP TABLE users;--"
}
```

Nginx buffers the body to disk. `ngx.req.get_body_data()` returns `nil`. The Lua gatekeeper falls back to `body = ""` (empty string), scores the request as safe, and passes the raw malicious 20KB payload straight to the backend!

### The Production Fix
You must explicitly inspect `ngx.req.get_body_file()` when in-memory data is unavailable — but **not** with `io.open`, which is the second half of this bug:

```lua
-- ❌ WRONG. Fixes the bypass, introduces a worse one.
local function get_sanitized_body()
    local body = ngx.req.get_body_data()
    if body then return body end

    local body_file = ngx.req.get_body_file()
    if body_file then
        local fh = io.open(body_file, "r")   -- BLOCKING syscall
        if fh then
            body = fh:read(65536)
            fh:close()
            return body or ""
        end
    end
    return ""
end
```

### ⚠️ Pitfall: `io.open` Is a Blocking Call in a Single-Threaded Event Loop

OpenResty's Lua VM is single-threaded and cooperatively scheduled. Cosockets
(`ngx.location.capture`, `httpc:*`, `ngx.timer`) yield, which is what lets one
worker multiplex thousands of connections. The Lua standard library does not:
`io.open`, `fh:read`, and `fh:close` are ordinary blocking syscalls that hold
the worker until the kernel returns.

Swap the bypass for a stall and the exploit gets easier. An attacker sends 200
concurrent requests with 20 KB bodies. Nginx spools all 200 to disk. Every
worker hits `io.open`/`read`/`close` and blocks. Those workers now serve
*nothing* — not WAF inspection, not static assets, not health checks. You have
replaced a request-scoped bypass with a worker-scoped denial of service, and
you did it in the section labelled "the fix."

**Symptom → cause → fix:** worker CPU near 0% while request latency climbs and
`nginx` shows connections in ` Sending`/`Waiting` with no upstream → blocking
file I/O on the request path → use `ngx.location.capture` with an
`internal` location, or enforce a body-size ceiling at the `server` level so
large bodies are rejected before they ever reach Lua.

**The better fix is to stop spooling at all.** If you only need the first N KB
for inference, cap the body and reject the rest — the WAF never has to read a
file:

```nginx
server {
    # Reject oversized bodies before Lua runs. Also makes
    # ngx.req.get_body_data() non-nil for everything that gets through,
    # which removes the disk path entirely.
    client_max_body_size 64k;
    client_body_buffer_size 64k;   # >= client_max_body_size: never spools

    location / {
        access_by_lua_file /etc/nginx/lua/gatekeeper.lua;
        proxy_pass http://backend;
    }
}
```

The trap from §1 stops existing when `client_body_buffer_size` is at least
`client_max_body_size`. That is a one-line fix to a bug that took an
adversary one HTTP header to exploit.

If you genuinely must inspect large bodies, read them asynchronously via
`ngx.location.capture` to an `internal` location, or copy to shared memory with
`ngx.on_abort`-aware coroutines — never `io.*` on the request path.

---

## 2. Socket Exhaustion: Keepalive Pools under Load

In the initial implementation, we used `httpc:request_uri()` to make HTTP calls to `127.0.0.1:5000`.

While `request_uri()` is non-blocking thanks to OpenResty cosockets, it opens and closes a new TCP connection on every request.

Under high traffic (500+ RPS), closing thousands of TCP connections per second floods the kernel with sockets stuck in the **`TIME_WAIT`** state. Eventually, the operating system runs out of ephemeral ports, throwing `cannot assign requested address` errors.

### The Fix: Explicit Connection Pooling
Reuse TCP connections to the sidecar with `httpc:set_keepalive`:

```lua
local http = require "resty.http"
local httpc = http.new()
httpc:set_timeouts(50, 100, 100) -- connect, send, read (ms)

local ok, err = httpc:connect("127.0.0.1", 5000)
if not ok then
    ngx.log(ngx.ERR, "Sidecar connect failed: ", err)
    return -- Fail open
end

local res, err = httpc:request({
    path = "/analyze",
    method = "POST",
    headers = { ["Content-Type"] = "application/json" },
    body = cjson.encode(payload),
})

if not res then
    ngx.log(ngx.ERR, "Sidecar request error: ", err)
    return -- Fail open
end

local response_body = res:read_body()

-- Keep socket alive: 60s idle timeout, pool size of 128 connections
httpc:set_keepalive(60000, 128)
```

---

## 3. The Availability Equation: Zero-Latency Circuit Breaking

Putting an ML model on the synchronous HTTP request path changes system availability:

```
Total Availability = Nginx Availability × Model Availability
```

If the Python model service begins thrashing (e.g., GC pause, GPU contention, or thread lock), every incoming request waits for the full read timeout (100ms). Under high concurrency, Nginx worker memory and connection slots saturate, bringing down the entire site.

### The In-Memory Circuit Breaker with `lua_shared_dict`
We allocate a lock-free shared memory zone across all Nginx workers to track sidecar failures. If 5 consecutive requests fail or time out, the circuit breaker trips and **fails open in < 0.05 ms** without touching the sidecar for 30 seconds.

```nginx
# nginx.conf
http {
    # 1MB shared dictionary across all Nginx worker processes
    lua_shared_dict waf_circuit 1m;
}
```

```lua
-- In gatekeeper.lua before making the HTTP call:
local shm = ngx.shared.waf_circuit
local is_tripped = shm:get("tripped")

if is_tripped then
    -- Circuit is OPEN: Skip AI inspection instantly to protect user traffic
    return
end

-- If sidecar fails:
if not res then
    local failures = shm:incr("failure_count", 1, 0)
    if failures >= 5 then
        shm:set("tripped", true, 30) -- Trip for 30 seconds
        shm:set("failure_count", 0)
        ngx.log(ngx.ALERT, "AI WAF Circuit Breaker TRIPPED: Failing open for 30s")
    end
    return
end

-- On success, reset the failure counter
shm:set("failure_count", 0)
```

### ⚠️ Pitfall: This Circuit Is a Denial-of-Service Weapon aimed at You

Read the code above again with an attacker's mindset. The breaker trips after
**5 consecutive failures** and stays open for **30 seconds**, and while open,
*every request passes uninspected*.

An attacker does not need to exploit the ML model. They need to make it look
unhealthy. If the sidecar is a shared inference service, or has a cold start, or
has any path where a request can be made to take longer than your 100 ms read
timeout, then:

1. Attacker sends 5 requests designed to be slow to classify — long bodies, or
   payloads that maximise tokenizer work.
2. Circuit opens. For the next 30 seconds, **the WAF is off and the attacker
   knows it**, because the timing is deterministic.
3. Attacker sends the actual payload through the open circuit.
4. Circuit closes. Attacker repeats.

Five requests buys thirty seconds of unfiltered access, and the cycle is fully
automatable. Worse, this is not even a bug in the ML path — it is a property of
fail-open plus a low threshold plus a fixed window, and it exists in the design
as written.

Note also that `shm:incr("failure_count", 1, 0)` counts *consecutive* failures
across **all** workers, because `lua_shared_dict` is shared. A single unlucky
request anywhere increments the same counter that a coordinated attack is
trying to push over the threshold. Low traffic plus one cold start can trip it
by accident.

**Symptom → cause → fix:** your own WAF's block rate drops to zero for 30-second
intervals on a schedule → fail-open breaker tripped by an adversary → see below.

**Fixes, in order of how much I would trust them:**

1. **Fail closed on a tripped circuit**, at least for anything that looks like
   an attack. An uninspected request is not a safe request. Serve 503 for
   mutating endpoints rather than proxying blind.
2. **Layer a deterministic filter underneath the breaker.** OWASP CRS or a
   small set of high-confidence rules costs microseconds and does not care
   whether the model is healthy. This is the actual answer — the ML layer is
   defence in depth, never the only layer. The "best practices" section below
   says this; it needs to be said *here*, because the breaker's whole purpose
   is to disable it.
3. **Trip on rate, not just consecutive failures**, and add a floor so a single
   burst cannot open it.
4. **Alarm on the trip.** The `ngx.log(ngx.ALERT, ...)` line above is correct
   and almost nobody wires it to anything. If a breaker trips and no human
   hears about it, you have no idea whether it was your model or an attacker.

The honest framing: `Total Availability = Nginx × Model` is the right model for
*choosing* a timeout, and it is the wrong reason to fail open. Availability
gained by dropping your security control is not availability you get to keep.
Budget for the model being down, and decide in advance what happens then —
before an attacker decides for you.

---

## 4. Adversarial Evasion: Normalization & Encoding

Attackers rarely send raw plaintext payloads. They manipulate encodings so the model’s tokenizer sees benign tokens while the target backend executes the payload:

1. **URL Double Encoding**: `%2527` becomes `%27` (a single quote `'`) after decoding twice. If your edge layer only decodes once and your backend framework decodes a second time, the ML model misses the attack.
2. **Unicode Homoglyphs**: Replacing ASCII letters with fullwidth Unicode characters (`＜ｓｃｒｉｐｔ＞`).
3. **Null Byte Truncation**: Injecting `%00` to terminate strings early in C-based backend parsers.

### The Mitigation: Shared Preprocessing Pipeline
Your production Python inference service must run the exact same text normalization pipeline used during model training:

```python
import unicodedata
import urllib.parse

def normalize_payload(text: str) -> str:
    # 1. Fully resolve multi-stage URL encodings
    for _ in range(2):
        decoded = urllib.parse.unquote(text)
        if decoded == text:
            break
        text = decoded

    # 2. Normalize Unicode to standard NFKD canonical decomposition
    text = unicodedata.normalize("NFKD", text)

    # 3. Strip control characters & null bytes
    text = "".join(ch for ch in text if ch.isprintable())
    
    return text.lower()
```

---

## Summary Architecture & Best Practices

1. **Set `client_body_buffer_size >= client_max_body_size`.** One line in `server {}` removes the disk-spill bypass entirely, because the body never leaves memory. Everything below is a mitigation for the case where you cannot bound the body size.
2. **Never use `io.open` on the request path.** OpenResty's Lua VM is single-threaded; a blocking read stalls the worker. If you must read a spooled body, use `ngx.location.capture` against an `internal` location.
3. **Pool sidecar connections** with `set_keepalive(timeout, size)` to avoid `TIME_WAIT` exhaustion. Return sockets to the pool on **every** exit path, including error paths — a socket dropped on an error is a socket that has to be reconnected next time, which is exactly the wrong behaviour under load.
4. **Circuit-break the model, but never let the circuit be the only defence.** A `lua_shared_dict` breaker with a 5-failure threshold and a 30-second fail-open window is a 30-second WAF outage waiting for someone to induce it. Put OWASP CRS or an equivalent deterministic filter underneath, so "circuit open" degrades to "weaker inspection" rather than "no inspection".
5. **Alert on breaker trips.** An unmonitored fail-open circuit is indistinguishable from a successful attack.
6. **Validate the model offline.** The `> 0.85` threshold in Part 1 has no stated evaluation methodology. Before it gates production traffic, it needs a labelled set, a false-positive budget, and an ROC curve — otherwise you are trusting a number you cannot defend to an attacker who can measure it.
