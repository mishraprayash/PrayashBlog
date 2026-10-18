---
title: "Docker Multi-Stage Builds: Layer Optimization and Image Size"
slug: "docker-production-traps-edge-cases"
description: "How to shrink container images from 1.2GB to 140MB using multi-stage builds, BuildKit cache mounts, production pruning, and handling Linux kernel whiteout traps."
publishDate: "2026-06-04T10:00:00Z"
author: "Prayash Mishra"
pillar: "running-services"
tags: ["docker", "node"]
series: "docker-node"
seriesPart: 2
draft: false
---

In **[Part 1: Docker Fundamentals & Single-Stage Best Practices](/blog/architecting-lightweight-docker-builds)**, we established how Docker constructs layers, handles cache invalidation, and why single-stage builds hit a hard ceiling when building modern TypeScript applications.

If your production container ships with the TypeScript compiler, test frameworks, and raw source code, your image will exceed **1.2GB**, increasing cold-start container pull times in Kubernetes and widening your security attack surface.

In this guide, we'll build a production 3-stage pipeline, configure BuildKit cache mounts, and look at the kernel-level edge cases that cause subtle bugs when stripping down images.

---

## 1. The Multi-Stage Paradigm: Build Environment vs. Runtime

A **Multi-Stage Build** allows a single `Dockerfile` to declare multiple `FROM` instructions. Each `FROM` represents a completely isolated build environment with its own filesystem state.

You can selectively copy only the compiled artifacts (`dist/`) and pruned production dependencies from an earlier stage into a fresh, minimal runtime container:

```
┌────────────────────────────────────────────────────────┐
│ Stage 1: deps (node:20-slim)                           │
│  └── Installs full dependencies (including dev tools)  │
└────────────────────────┬───────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 2: builder (node:20-slim)                        │
│  └── Compiles TypeScript (`dist/`) & runs build steps  │
└────────────────────────┬───────────────────────────────┘
                         │ (Copies only dist/ & pruned modules)
                         ▼
┌────────────────────────────────────────────────────────┐
│ Stage 3: runner (node:20-slim - Production Image)      │
│  └── Contains zero compilers, source code, or tests!   │
└────────────────────────────────────────────────────────┘
```

The resulting production image contains **only what is strictly necessary to run the application** in production.

---

## 2. Crafting a Production 3-Stage Dockerfile

A 3-stage Dockerfile for a TypeScript / NestJS application:

```dockerfile
# syntax=docker/dockerfile:1

# ==========================================
# Stage 1: Dependencies Cache (deps)
# ==========================================
FROM node:20-slim AS deps
WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# BuildKit cache mount prevents re-downloading npm packages across builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline

# ==========================================
# Stage 2: Application Builder (builder)
# ==========================================
FROM node:20-slim AS builder
WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript to JavaScript (/app/dist)
RUN npm run build

# Prune devDependencies to keep only production packages
RUN npm prune --omit=dev

# ==========================================
# Stage 3: Production Runtime (runner)
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Run as non-root user
USER node

# Copy ONLY pruned production modules and compiled output
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node package.json ./

EXPOSE 3000

# Use exec form to ensure process receives SIGTERM signals
CMD ["node", "dist/main.js"]
```

### 🔍 Deep Dive: Why this is Optimal
1. **`COPY --from=deps /app/node_modules`**: The `builder` stage avoids re-running `npm ci`. It inherits the dependency layer from Stage 1.
2. **`npm prune --omit=dev`**: Strips out hundreds of megabytes of build tools (`typescript`, `@types/*`, `jest`, `eslint`) before copying to Stage 3. (`--production` is the deprecated spelling of this flag and warns on npm 7+.)
3. **`COPY --chown=node:node`**: Sets file ownership directly during copy, avoiding an expensive subsequent `RUN chown -R node:node /app` that would duplicate the entire filesystem layer in OverlayFS!

---

## 3. BuildKit Optimizations: Cache Mounts & Secrets

Modern Docker engines use **BuildKit** to dramatically speed up builds and protect sensitive build-time credentials.

### 1. Package Cache Mounts (`--mount=type=cache`)
By default, Docker destroys `/root/.npm` at the end of each `RUN` command. With BuildKit cache mounts, the cache is preserved on the host builder across builds:

```dockerfile
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline
```

* **Impact**: Changing one dependency in `package.json` only downloads the newly added package rather than downloading the entire registry from scratch.

### 2. Secure Private Registry Tokens (`--mount=type=secret`)
If your application depends on private npm or GitHub Packages, never use `ARG NPM_TOKEN`. BuildKit mounts secrets into memory without writing them to disk:

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

```bash
docker buildx build --secret id=npmrc,src=./.npmrc -t my-app:v1 .
```

---

## 4. Real-World Image Size Comparison

Let's compare the actual disk footprint of a standard NestJS application built using different strategies:

| Build Strategy | Base Image | Included Artifacts | Resulting Image Size |
| :--- | :--- | :--- | :--- |
| **Naive Single-Stage** | `node:20` (Full) | Compilers, Git, devDependencies, Source | **1,240 MB** |
| **Optimized Single-Stage** | `node:20-slim` | devDependencies, TypeScript, Source | **420 MB** |
| **Production Multi-Stage** | `node:20-slim` | **Only compiled `dist/` & production modules** | **142 MB** |

> **Result:** An **88% reduction in image size**, cutting Kubernetes pod pull latency from 25 seconds down to under 3 seconds.

---

## 5. Obscure Production Traps & Edge Cases

### 1. The Kernel Whiteout Trap (`0:0` Character Device)
In Linux OverlayFS, image layers are immutable. If Layer 2 installs a 200MB package, and Layer 3 runs `RUN rm -rf /large-file`:
* **The 200MB file is NOT deleted from the image.**
* Instead, OverlayFS writes a **`0:0` character device (a whiteout marker)** in Layer 3 that masks the file from the container's view.
* The 200MB remains permanently baked into Layer 2, consuming network download bandwidth.

```
Layer 3: RUN rm -rf /data.tar.gz  ──► [Whiteout Marker: 0:0] (Adds layer size!)
Layer 2: RUN curl -O /data.tar.gz ──► [200MB Data File] (Permanently stored on disk)
```

**Fix:** Always chain download, extraction, and cleanup into a **single `RUN` instruction**, or use multi-stage builds where intermediate layers are discarded.

### 2. Alpine `musl` vs. Debian `glibc`
Many guides recommend `node:20-alpine` purely because the base image is ~45MB. However, in production:
* Alpine uses **`musl libc`** instead of standard GNU C Library (**`glibc`**).
* **Native C++ bindings** (e.g., `sharp`, `bcrypt`, `prisma`, `grpc`) must compile from source during build or download specialized musl binaries.
* `musl` has a **128KB default thread stack size** (compared to 8MB in glibc). Heavy Node.js worker threads or recursive parsers can trigger sudden `SIGSEGV` segmentation faults.
* **Rule:** Prefer `node:20-slim` (Debian glibc) unless you have extensively benchmarked your native dependencies on Alpine.

### 3. PID 1 & Zombie Process Reaping
When Node.js runs as PID 1 inside a container, it does not act as a traditional init system (systemd):
1. **Zombie Reaping**: Node.js does not reap orphaned child processes (`zombie` state), leading to process table exhaustion.
2. **Signal Handling**: Linux treats PID 1 specially—it does not apply default signal handlers. If your Node app does not explicitly register `process.on('SIGTERM', ...)`, `docker stop` or Kubernetes pod eviction will wait 10 seconds and forcefully kill your container with `SIGKILL`, abruptly dropping in-flight user requests!

**Fix:** Use an init wrapper like `tini` or `dumb-init`:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
```

---

## Summary Architecture Checklist

Claims to verify against your own build, not boxes to tick:

* [ ] **3-Stage Build**: `deps`, `builder`, and `runner` are separate, and the final image contains compiled artifacts only — no `typescript`, no `node_modules/.bin`, no source.
* [ ] **Prune Dependencies**: `npm prune --omit=dev` runs before the copy into `runner`, and `node_modules/typescript` is genuinely absent from the final image.
* [ ] **BuildKit cache mounts**: `--mount=type=cache,target=/root/.npm` is in the `deps` stage, and a second build with an unchanged lockfile is measurably faster.
* [ ] **Base image is glibc, not musl**: `node:20-slim`, not `node:20-alpine`. Confirm with `ldd --version` inside the image, and confirm your native modules (`better-sqlite3`, `sharp`, `node-gyp` builds) actually load.
* [ ] **Deleting files in a later layer does not shrink the image**: check with `docker history` that you are not shipping a layer whose contents you deleted above it.
* [ ] **Signals reach PID 1**: `tini` (or an explicit `SIGTERM` handler) is in place, and a `docker stop` actually drains in-flight requests.
* [ ] **The image runs as non-root** and as a numeric UID, so Kubernetes `runAsNonRoot` does not trip over a missing passwd entry.
