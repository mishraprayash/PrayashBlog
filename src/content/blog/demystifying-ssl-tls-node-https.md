---
title: "Demystifying TLS in Node.js: Handshake Mechanics, Event-Loop Stalls, and Cert Chain Traps"
slug: "demystifying-ssl-tls-node-https"
description: "A practical deep dive into Node.js TLS termination: how handshakes impact the event loop, why AIA chasing hides missing intermediate certs, and handling live cert rotation without downtime."
publishDate: "2026-05-10T10:00:00Z"
author: "Prayash Mishra"
tags: ["node", "backend", "security", "tls", "https"]
category: "engineering"
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "TLS handshake and certificate chain validation diagram"
draft: false
---

Almost every "How to set up HTTPS in Node.js" tutorial tells you to write this:

```js
const https = require("https");
const server = https.createServer({ key, cert }, app);
```

They call it a day and move on. But in production, this is where the real headaches begin: mobile clients failing with `ERR_CERT_AUTHORITY_INVALID` while desktop browsers work fine, Node processes silently serving expired certificates after 90 days, and sudden spikes in TLS handshakes causing event-loop latency.

Here is what is actually happening beneath the Node.js TLS layer, why things break, and how to configure HTTPS reliably.

---

## 1. What Actually Happens During a Handshake

When a client initiates an HTTPS connection, the TLS handshake happens before a single byte of HTTP data is transmitted:

```
Client                                                  Server (Node.js)
  │                                                           │
  │─── 1. ClientHello (Cipher suites, SNI, Key Share) ───────►│
  │                                                           │ ── [OpenSSL computes
  │                                                           │     ECDHE key exchange]
  │◄── 2. ServerHello + Certificate Chain + Key Share ────────│
  │                                                           │
  │─── 3. Finished (Encrypted Handshake Check) ──────────────►│
  │                                                           │
  │◄═════════════════ Application Data (HTTP/2) ═════════════►│
```

### The Event Loop & Crypto CPU Cost
Node.js delegates cryptography to OpenSSL through C++ bindings (`node::crypto::TLSWrap`). 

While symmetric payload encryption (AES-128-GCM / ChaCha20) is fast, **asymmetric key exchanges during the initial handshake** (especially RSA 4096 or complex ECDHE curves) are CPU-intensive. 

If hundreds of clients connect simultaneously (a "thundering herd"), the cryptographic computations can saturate CPU cores, delaying event-loop timers and stalling I/O callbacks.

---

## 2. The Intermediate Chain Trap: Why Mobile Fails While Chrome Passes

This is the most common TLS mistake in Node.js, and it causes intermittent outages that are painful to debug:

```js
// ❌ WRONG: The intermediate bundle does NOT go in `ca` for servers!
const credentials = {
  key: privateKey,
  cert: leafCert,          // Only the leaf certificate
  ca: intermediateChain,   // ⚠️ Mistake!
};
```

### Why this is a trap
In Node’s `https.createServer`, the `ca` option specifies the Certificate Authorities the server trusts when **verifying incoming client certificates (mTLS)**. It is *not* what the server sends to clients.

When you configure it this way, Node only sends the **leaf certificate** to connecting browsers:
* **Desktop Chrome/Edge** often succeeds because they perform **AIA Chasing** (Authority Information Access)—the browser silently fetches the missing intermediate certificate over HTTP in the background and caches it.
* **Mobile Apps & curl** generally disable AIA chasing for performance and battery reasons. They fail immediately with `CERT_UNTRUSTED` or `certificate_unknown`.

### The Proper Fix:
Concatenate your leaf certificate and intermediate certificates into the **`cert`** parameter:

```js
// ✅ CORRECT: Full certificate chain served together
const credentials = {
  key: fs.readFileSync("/etc/certs/privkey.pem", "utf8"),
  cert: [
    fs.readFileSync("/etc/certs/cert.pem", "utf8"),        // Leaf
    fs.readFileSync("/etc/certs/chain.pem", "utf8")        // Intermediate
  ].join("\n"),
};
```

### Verify What You’re Actually Serving
Never test TLS with just your local desktop browser. Use `openssl s_client`:

```bash
echo | openssl s_client -connect localhost:443 -showcerts 2>/dev/null \
  | grep -c "BEGIN CERTIFICATE"
# Output should be ≥ 2 (Leaf + Intermediates). If it's 1, mobile clients will fail!
```

---

## 3. The 90-Day Renewal Trap: Zero-Downtime Cert Rotation

If you load certificates with `fs.readFileSync()` when your server boots:

```js
const credentials = { key: fs.readFileSync(...), cert: fs.readFileSync(...) };
https.createServer(credentials, app).listen(443);
```

Your Node process keeps the initial certificate loaded in memory for its entire lifetime. When Certbot or your ACME client renews your Let’s Encrypt certificates after 60–90 days, **Node continues serving the old expired cert** until the process restarts.

### Solution: Live Rotation with `server.setSecureContext()`
Since Node.js v11, you can update the active TLS context on a running server without dropping active TCP connections:

```js
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";

const CERT_DIR = "/etc/letsencrypt/live/example.com";

async function loadSecureContext() {
  const [key, cert, chain] = await Promise.all([
    fs.readFile(path.join(CERT_DIR, "privkey.pem"), "utf8"),
    fs.readFile(path.join(CERT_DIR, "cert.pem"), "utf8"),
    fs.readFile(path.join(CERT_DIR, "chain.pem"), "utf8"),
  ]);

  return {
    key,
    cert: [cert, chain].join("\n"),
  };
}

const server = https.createServer(await loadSecureContext(), app);

// Re-read certificates from disk every 24 hours
setInterval(async () => {
  try {
    const updatedContext = await loadSecureContext();
    server.setSecureContext(updatedContext);
    console.log("TLS context reloaded successfully");
  } catch (err) {
    console.error("Failed to reload TLS context:", err);
  }
}, 24 * 60 * 60 * 1000);
```

> **Note on Active Connections:** `setSecureContext()` applies immediately to **all new incoming handshakes**. Existing keepalive HTTP/1.1 connections and open HTTP/2 streams continue safely on the previous context until closed.

---

## 4. Crucial Production Checklist

1. **Terminate TLS at the Reverse Proxy when possible**: Offloading TLS to Nginx, Caddy, or an ALB saves Node's single thread from handling heavy asymmetric crypto handshakes.
2. **Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`**: This globally disables certificate verification for *all* outbound HTTPS calls in your process, opening your backend to trivial Man-in-the-Middle (MITM) attacks.
3. **Enable ALPN for HTTP/2**: If serving traffic directly, negotiate HTTP/2 explicitly:
   ```js
   https.createServer({
     ALPNProtocols: ["h2", "http/1.1"],
     ...credentials
   }, app);
   ```
4. **Use Modern ECDSA Keys**: Prefer ECDSA (P-256) over RSA 4096. ECDSA handshakes use smaller certificates, transmit fewer bytes, and compute key signatures significantly faster.

---

## Summary

* Put your **full chain (leaf + intermediates)** in `cert`, not `ca`.
* Verify with `openssl s_client` to ensure you aren't silently relying on desktop browser AIA chasing.
* Use **`server.setSecureContext()`** if your Node process needs to reload certificates without downtime.
* Offloading TLS to an edge proxy remains the cleanest architecture for high-concurrency Node apps.
