---
title: "Part 2: Building an AI-Powered WAF on Nginx – Traps, Bypasses, and Hardening"
slug: "nginx-lua-ai-waf-traps-bypasses"
description: "The hard lessons learned deploying an AI WAF: the silent get_body_data() disk-spill bypass, ephemeral socket exhaustion, zero-latency shared-memory circuit breakers, and adversarial evasion."
publishDate: "2026-06-29T10:00:00Z"
author: "Prayash Mishra"
tags: ["nginx", "lua", "waf", "security", "ml", "openresty"]
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
You must explicitly inspect `ngx.req.get_body_file()` when in-memory data is unavailable:

```lua
local function get_sanitized_body()
    -- 1. Try reading from memory buffer
    local body = ngx.req.get_body_data()
    if body then
        return body
    end

    -- 2. Fallback: Read from the temporary disk spool file
    local body_file = ngx.req.get_body_file()
    if body_file then
        local fh, err = io.open(body_file, "r")
        if fh then
            -- Read up to our inspection budget (e.g., first 64KB)
            body = fh:read(65536)
            fh:close()
            return body or ""
        end
    end

    return ""
end
```

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

1. **Check Both RAM and Disk for Bodies**: Never assume `ngx.req.get_body_data()` is non-nil; always provide a fallback to `ngx.req.get_body_file()`.
2. **Pool Sidecar Connections**: Use `set_keepalive(timeout, size)` to prevent ephemeral port exhaustion under heavy traffic.
3. **Use Shared-Memory Circuit Breakers**: Wrap ML sidecars in a `lua_shared_dict` circuit breaker to prevent external latency from cascading into site outages.
4. **Layered Defense**: Keep deterministic regex/rule engines (like OWASP CRS) as the primary filter for obvious attacks, and reserve ML models for complex, contextual payload inspection.
