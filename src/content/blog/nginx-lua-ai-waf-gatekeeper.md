---
title: "Part 1: Building an AI-Powered WAF on Nginx – Architecture & Implementation"
slug: "nginx-lua-ai-waf-gatekeeper"
description: "How I built a real-time AI web-attack gatekeeper at the edge: Nginx TLS termination, the ngx_lua access phase, non-blocking cosockets, and a Python PyTorch inference sidecar."
publishDate: "2026-06-22T10:00:00Z"
author: "Prayash Mishra"
tags: ["nginx", "lua", "waf", "security", "ml", "openresty"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Nginx TLS termination with a Lua gatekeeper calling an AI model sidecar"
draft: false
---

Traditional Web Application Firewalls (WAFs) rely heavily on static signature rules and regex patterns to catch SQL injections, XSS, and path traversal attacks. While fast, regex struggles with context, nested encodings, and evolving prompt-injection payloads.

I wanted to see what it takes to build an **intelligent, real-time attack gatekeeper at the edge**—intercepting traffic directly in Nginx, running request metadata and bodies through a machine learning classifier, and blocking malicious hits before they ever reach the backend application.

Here is how I architected and implemented the system end-to-end.

---

## 1. The High-Level Architecture

The goal was to place the AI gatekeeper as close to the wire as possible without introducing latency bottlenecks into the backend application.

```
  Client (HTTPS)
     │
     ▼
┌───────────────────────────────────────────────────────────┐
│ Nginx / OpenResty Reverse Proxy                           │
│                                                           │
│  [1] TLS Termination ──► Decrypts to plaintext HTTP       │
│  [2] access_by_lua   ──► Captures request snapshot        │
│                          │                                │
│                          ▼ (Non-blocking HTTP POST)       │
│                     ┌───────────────────────────┐         │
│                     │ Python Model Sidecar      │         │
│                     │ (PyTorch Classifier :5000)│         │
│                     └───────────────────────────┘         │
│                          │                                │
│        ┌─────────────────┴─────────────────┐              │
│        ▼ Malicious (Score > 0.85)          ▼ Safe         │
│     403 Forbidden                   [3] proxy_pass        │
│     (Client rejected)                      │              │
└────────────────────────────────────────────┼──────────────┘
                                             ▼
                                  ┌────────────────────┐
                                  │ Upstream App       │
                                  │ (Node.js / Python) │
                                  └────────────────────┘
```

Three design decisions define this setup:

1. **TLS Terminates at Nginx**: The WAF must inspect the decrypted plaintext. By terminating TLS at the edge, Nginx extracts raw methods, URIs, query strings, and payloads.
2. **Inline Decision Point**: The gatekeeper runs during request processing. Malicious traffic is cut off at the perimeter; safe traffic flows through `proxy_pass` transparently.
3. **Decoupled Inference Sidecar**: Nginx acts as the decision enforcement point, while an independent Python microservice on `127.0.0.1:5000` hosts the PyTorch model.

---

## 2. Nginx Request Phases: Hooking the Gatekeeper

Nginx evaluates requests through distinct phases:
`post-read` → `rewrite` → `access` → `content` → `log`.

When writing Lua in Nginx (via OpenResty), choosing the right phase directive is crucial:

* ❌ **`content_by_lua`**: Nginx allows **only one content handler** per `location`. If you define both `content_by_lua` and `proxy_pass`, Nginx throws a conflict error on reload.
* ✅ **`access_by_lua_block`**: Runs in the `access` phase—after HTTP headers and body are received, but *before* the upstream handler executes. This is where security gates belong.

```nginx
# /etc/nginx/conf.d/waf.conf
server {
    listen 443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Instruct Nginx to read the request body into memory before access phase
    lua_need_request_body on;

    location / {
        access_by_lua_file /etc/nginx/lua/gatekeeper.lua;
        
        # Safe traffic reaches the upstream app
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 3. The Lua Gatekeeper Implementation

The Lua script extracts the request snapshot, makes a non-blocking HTTP call to the sidecar, and enforces the verdict.

Because Nginx worker processes run on a single-threaded event loop (`epoll`/`kqueue`), we must use OpenResty's **`resty.http`** cosocket library so network I/O yields cleanly without freezing concurrent connections.

```lua
-- /etc/nginx/lua/gatekeeper.lua
local http = require "resty.http"
local cjson = require "cjson.safe"

-- 1. Snapshot the request metadata and body
local payload = {
    method  = ngx.req.get_method(),
    uri     = ngx.var.uri,
    query   = ngx.var.args or "",
    headers = {
        user_agent = ngx.var.http_user_agent or "",
        host       = ngx.var.http_host or "",
    },
    body    = ngx.req.get_body_data() or "",
}

-- 2. Call the AI inference sidecar
local httpc = http.new()
httpc:set_timeouts(50, 100, 100) -- 50ms connect, 100ms send/read

local res, err = httpc:request_uri("http://127.0.0.1:5000/analyze", {
    method = "POST",
    body = cjson.encode(payload),
    headers = {
        ["Content-Type"] = "application/json",
    },
})

-- 3. Fail-open if the sidecar is unreachable
if not res then
    ngx.log(ngx.ERR, "AI sidecar unreachable: ", err)
    return -- Allow request to pass through
end

-- 4. Parse the decision
local data = cjson.decode(res.body)
if data and data.malicious == true then
    ngx.log(ngx.WARN, "Blocked attack! Score: ", data.score, " Path: ", ngx.var.uri)
    return ngx.exit(ngx.HTTP_FORBIDDEN) -- Return 403 immediately
end

-- 5. Safe: Allow execution to fall through to proxy_pass
```

---

## 4. The Python Inference Sidecar

On the model side, I built a lightweight Python service using a PyTorch sequence classifier trained to detect web attack patterns.

```python
# model_service.py
from flask import Flask, request, jsonify
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

app = Flask(__name__)

# Load tokenizer and model
MODEL_DIR = "./saved_waf_model"
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()

THRESHOLD = 0.85

def format_request_text(data: dict) -> str:
    """Combines HTTP components into a normalized token string."""
    method = data.get("method", "")
    uri = data.get("uri", "")
    query = data.get("query", "")
    body = data.get("body", "")
    return f"{method} {uri}?{query} \n\n {body}"

@app.post("/analyze")
def analyze():
    data = request.get_json(force=True)
    raw_text = format_request_text(data)

    # Tokenize and run inference
    inputs = tokenizer(raw_text, truncation=True, max_length=512, return_tensors="pt")
    
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=-1)
        malicious_score = probs[0][1].item() # Probability of attack class

    is_malicious = malicious_score >= THRESHOLD

    return jsonify({
        "malicious": is_malicious,
        "score": round(malicious_score, 4)
    })

if __name__ == "__main__":
    # Multi-threaded server to handle concurrent inference requests
    app.run(host="127.0.0.1", port=5000, threaded=True)
```

---

## 5. Seeing It in Action

With both Nginx and the Python service running, we test the perimeter:

```bash
# 1. Normal benign request:
curl -i https://api.example.com/products?category=shoes
# Returns: HTTP/1.1 200 OK (from Upstream App)

# 2. SQL injection payload:
curl -i "https://api.example.com/login?user=admin%27%20OR%201=1--"
# Returns: HTTP/1.1 403 Forbidden (Blocked at Nginx perimeter)
```

The upstream application never receives the malicious request, keeping backend databases and application runtimes insulated from the attack.

---

## Coming in Part 2: The Production Traps & Bypasses

Building the initial prototype was straightforward—making it reliable and secure under real-world production traffic was where the real challenge began.

In **[Part 2](/blog/nginx-lua-ai-waf-traps-bypasses)**, we dive into:
1. **The Silent WAF Bypass**: How payloads > 16 KB cause `ngx.req.get_body_data()` to return `nil`, allowing attackers to bypass the firewall completely.
2. **Socket Exhaustion & Keepalives**: Avoiding `TIME_WAIT` port exhaustion under high RPS.
3. **Availability & Circuit Breakers**: Building in-memory `lua_shared_dict` circuit breakers to eliminate latency degradation when the model is slow.
4. **Adversarial Token Evasion**: Defending against URL double-encoding and Unicode homoglyphs.
