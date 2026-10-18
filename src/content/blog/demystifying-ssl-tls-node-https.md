---
title: "TLS in Node.js: Handshake Mechanics, Event-Loop Stalls, and Cert Chain Traps"
slug: "demystifying-ssl-tls-node-https"
description: "A practical deep dive into Node.js TLS termination: how handshakes impact the event loop, why AIA chasing hides missing intermediate certs, and handling live cert rotation without downtime."
publishDate: "2026-05-10T10:00:00Z"
updatedDate: "2026-10-18T10:00:00Z"
updateSummary: "Corrected the intermediate-certificate section. I'd written that putting the intermediate in `ca` makes Node send only the leaf. Testing on Node 22 showed it sends the full chain. Keeping the chain in `cert` is still the right call, for the reasons now in the post."
author: "Prayash Mishra"
tags: ["node", "backend", "security", "tls"]
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

They call it a day and move on. But in production, this is where the real headaches begin: curl and every server-side client failing with `unable to verify the first certificate` while your browser works fine, Node processes silently serving expired certificates after 90 days, and sudden spikes in TLS handshakes causing event-loop latency.

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

## 2. The Missing Intermediate: Why curl Fails While Chrome Passes

Your server has to send its own certificate (the leaf) and every intermediate between it and a root the client already trusts. Roots ship with the client. Intermediates don't. Send only the leaf and you get the most confusing kind of outage, the one that depends on who's asking:

* **Chrome, Edge and Safari** will usually fetch the missing intermediate themselves, using the URL in the leaf's Authority Information Access (AIA) extension, and cache it. Firefox doesn't fetch, but ships a list of known intermediates and often passes anyway. So the site looks fine in your browser.
* **curl, `openssl s_client`, and the HTTP clients in Node, Go and Python** do none of that. Node reports `unable to verify the first certificate` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`).

For an API, that second group is most of your traffic.

With Let's Encrypt, the usual way to get here is loading `cert.pem` where you meant `fullchain.pem`:

```js
// ❌ Leaf only. Fine in Chrome, broken for curl and for Node/Go/Python clients.
https.createServer({
  key: fs.readFileSync("/etc/letsencrypt/live/example.com/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/example.com/cert.pem"),
}, app);

// ✅ Leaf followed by intermediates.
https.createServer({
  key: fs.readFileSync("/etc/letsencrypt/live/example.com/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/example.com/fullchain.pem"),
}, app);
```

The [Node docs for `cert`](https://nodejs.org/api/tls.html#tlscreatesecurecontextoptions) say the same thing: the leaf, "followed by the PEM formatted intermediate certificates (if any), in order, and not including the root CA."

### What about passing the intermediate in `ca`?

`ca` is meant for the other direction. It's the set of CAs your server trusts when it verifies *client* certificates (mTLS). But Node gives that set to OpenSSL as a trust store, and OpenSSL will use it to complete the server's own chain when `cert` holds only the leaf. Here's what Node 22.22 does with a throwaway root → intermediate → leaf:

| Server options | Certs sent | `openssl s_client -CAfile root.pem` |
| :--- | :--- | :--- |
| `cert: leaf` | 1 | `Verify return code: 21 (unable to verify the first certificate)` |
| `cert: leaf`, `ca: intermediate` | 2 | `Verify return code: 0 (ok)` |
| `cert: leaf + intermediate` | 2 | `Verify return code: 0 (ok)` |

So it works. Don't rely on it anyway. It works as a side effect of how OpenSSL builds chains, not because the option is for that, and if you later set `requestCert: true` for mTLS, the same list quietly becomes your client trust store as well. Keep the chain in `cert`, where it's documented to go.

### Check what you're actually serving

Don't test this with your browser. It's the one client that hides the problem:

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null \
  | grep -c "BEGIN CERTIFICATE"
# 1 means leaf only: curl and server-side clients will fail.
# 2 or more means the intermediates are going out.
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

## 4. Production Hardening Rules

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

* Serve the **full chain (leaf + intermediates)** in `cert`. `ca` happens to fill the gap on current Node, but that's not what it's for.
* Check with `openssl s_client`, not a browser. Browsers fetch missing intermediates for you and hide the bug.
* Use **`server.setSecureContext()`** if your Node process needs to reload certificates without downtime.
* Offloading TLS to an edge proxy remains the cleanest architecture for high-concurrency Node apps.
