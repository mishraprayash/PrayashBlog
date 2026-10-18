# Phase 1 — Discovery & Audit

_Audited 2026-10-18 against commit `b59780b` (branch `claude/bold-rubin-yo1aif`)._

Method: read every file under `src/`, all 15 posts in full, `docs/blog-writing-guide.md`, config and deploy files; ran `npm run build`; inspected the built HTML; took Playwright screenshots at 1440×900 and 390×844 in light and dark; and **re-ran the highest-stakes technical claims** (Node 22 TLS, Postgres 16, lua-resty-http source) instead of judging them from memory. Where a claim is marked *verified*, the reproduction is described inline. Where it is marked *likely*, I am confident but did not reproduce it, and it needs checking before anything is published.

---

## 0. Assumptions (the brief had unfilled placeholders)

| Placeholder | Assumption until you tell me otherwise |
|---|---|
| Current design | "Over-decorated and template-y": competent scaffolding, too many badges and surfaces, weak identity |
| Target readers | Mid-to-senior backend engineers arriving from search on a specific problem; hiring managers / tech leads doing a 60-second skim |
| Desired impression | "This person understands how backend systems fail, and proves it" |
| Sites you admire | None given. I will propose references in Phase 2, but your own picks would steer the design direction more than mine |

---

## 1. Repository & stack

| Area | Finding |
|---|---|
| Framework | Astro 7.1, static output, `@astrojs/sitemap`, `@astrojs/rss`. No client framework. Good, cheap baseline. |
| Styling | Tailwind v4 via `@tailwindcss/vite`, `@tailwindcss/typography`. Tokens in `src/styles/global.css` `@theme` (warm `paper-*` ramp for light, `zinc-*` overridden as a cool slate ramp for dark, `brand-*` teal, `ember-*` amber). |
| Content | `src/content.config.ts` glob loader; `entry.id` = frontmatter `slug`. Series metadata hand-maintained in `src/data/series.ts`. |
| Pages | `/`, `/blog`, `/blog/[...slug]`, `/rss.xml`, `/404`. No about, projects, tag, series or search pages. Tag/series/category "pages" are client-side query-string filters on `/blog`. |
| Components | `TableOfContents`, `SeriesBanner`, `ShareWidget`, `PostNavigation`, `AuthorBio`. Header/footer inline in `BaseLayout.astro`. |
| Code blocks | Shiki dual theme (`github-light-default` / `github-dark-default`), switched by CSS vars. Copy button injected by an inline script. No filename labels, line highlighting, or language label. |
| Deploy | Vercel (`vercel.json`) with sensible security headers and immutable caching for `/images/*`. |
| Build | Clean: 18 pages in ~4 s, one CSS file (75 KB raw / 12 KB gzip), ~10 KB of inline JS on a post page. |

---

## 2. Content inventory

Words from `wc -w` on the source (includes code). "Depth" is my judgement against your own writing guide's bar.

| # | Title (as published) | Date | Pillar | Words | Depth | Quality notes |
|---|---|---|---|---|---|---|
| 1 | TLS in Node.js: Handshake Mechanics, Event-Loop Stalls, and Cert Chain Traps | 2026-05-10 | Edge & security | 930 | Intermediate | **The headline trap is false on current Node** (see §4.1). Shortest post; handshake/event-loop section asserts cost without numbers. |
| 2 | Part 1: Docker Fundamentals – Container Mechanics & Single-Stage Best Practices | 2026-05-28 | Containers & K8s | 1,189 | Intro | VM-vs-container, layer caching, `.dockerignore`: material your guide explicitly rules out ("not for beginners"). |
| 3 | Part 2: Docker Multi-Stage Builds – Layer Optimization & Image Size Reduction | 2026-06-04 | Containers & K8s | 1,335 | Intermediate | Good checklist. Size table and "25 s → 3 s pull" read as measurements but have no method. Series says 130 MB, description 140 MB, table 142 MB. K8s grace period stated as 10 s (it is 30 s; 10 s is `docker stop`). |
| 4 | Part 1: Building an AI-Powered WAF on Nginx – Architecture & Implementation | 2026-06-22 | Edge & security | 1,013 | Intermediate | Clear architecture. No inference latency numbers for a model sitting on the request path with a 100 ms read timeout — the one number the design hinges on. |
| 5 | Part 2: Building an AI-Powered WAF on Nginx – Traps, Bypasses, and Hardening | 2026-06-29 | Edge & security | 2,083 | Deep | Best adversarial thinking on the site (the breaker-as-DoS-weapon section). But §2's premise is false, the body-buffer default is misstated, and the padding bypass still works after the fix (§4.1). Contains editorial residue. |
| 6 | Scaling Multi-Channel Event Dispatching in NestJS: Strategy Pattern, Polymorphic DTOs, and OCP | 2026-07-16 | Node/NestJS | 1,742 | Intermediate | The registry hard-codes every strategy in its constructor, so adding a channel still edits it — the post's own code undercuts its OCP claim. The BullMQ `jobId` "fix" does not address the duplicate-SMS scenario it is offered for. Not linked to the idempotency post. |
| 7 | Part 1: …NestJS and Dapr – Core Fundamentals & Architecture | 2026-08-01 | Distributed reliability | 997 | Intro | Restates Dapr docs; the comparison table is one-sided ("Completely decoupled", "Universal"). |
| 8 | Part 2: …NestJS and Dapr – NestJS Module & Service Invocation | 2026-08-07 | Distributed reliability | 1,980 | Intermediate | Broken heading numbering (§2 → 1.1, §4 → 3.2). App IDs and ports disagree with Part 4. `DaprServer` is provided on port 3000, the same port Nest listens on. Retries a payment `POST` via resiliency policy with no idempotency key and no link to the idempotency post. Editorial residue. |
| 9 | Part 3: …NestJS and Dapr – State, Secrets, Config & Pub/Sub | 2026-08-14 | Distributed reliability | 2,300 | Intermediate–deep | The ETag trap is a genuinely useful find. Imports `DAPR_HTTP_URL` / `DAPR_API_TOKEN`, which Part 2's module never defines. Calls CloudEvents a W3C spec (it is CNCF). "Fail loudly" comment above code that logs and continues. |
| 10 | Part 4: …NestJS and Dapr – Local Dev & Production Kubernetes | 2026-08-21 | Distributed reliability | 2,259 | Intermediate–deep | Strong verification checklist. Recommends gating readiness on the sidecar, then the checklist says "probes bypass the sidecar". Uses the deprecated `-components-path` with daprd 1.14. Editorial residue. |
| 11 | Direct Media Uploads at Scale: S3 Presigned URLs, Security Constraints, and NestJS Implementation | 2026-08-23 | Edge & security | 2,688 | Intermediate–deep | Calls a virtual-hosted URL "path-style". Recommends a bucket-policy size limit through a condition key that (likely) does not exist. `confirm-upload` never checks that the key belongs to the caller. Editorial residue. |
| 12 | Message Queues, Topics, and Event Streams Explained | 2026-08-25 (upd. 09-09) | Distributed reliability | 2,697 | Intermediate | Best voice on the site: first person, honest, cross-linked. Explainer rather than deep dive. The "✅" claim pattern has a crash hole (§4.2). A stray bullet closes §3. |
| 13 | Production Kubernetes Debugging with k9s | 2026-08-28 | Containers & K8s | 2,271 | Intro–intermediate | Tool walkthrough. Typos ("In standard k8s", "k8s is faster" — meant k9s). The ephemeral-container pitfall gets the mechanism wrong, and the plugin passes the pod name as `--target`. |
| 14 | The Transactional Outbox Pattern: Why Your 100-Line Node.js Script Will Break in Production | 2026-09-09 | Distributed reliability | 1,914 | Deep | **Strongest post.** The ghost-row race is explained step by step. But the worker-sharding SQL silently drops 37% of rows (verified, §4.1), and the "or key by Kafka partition" alternative doesn't fix ordering that broke before Kafka. Bloat numbers aren't sourced. |
| 15 | Idempotency in Distributed Systems: The Production Realities | 2026-09-09 | Distributed reliability | 2,170 | Deep | **Second strongest.** The case against Redis `SETNX` is excellent. But the `IN_PROGRESS → 409` path is unreachable in the code shown (verified, §4.1), and the Mermaid diagram renders as raw text. |

**Totals:** 15 posts, ~27.6 k words. All 15 were published between 2026-05-10 and 2026-09-09, 7 of them in August. Four series (Distributed Systems 3, NestJS & Dapr 4, Nginx AI WAF 2, Docker 2) cover 11 of the 15. Every post has `category: engineering` and `featuredImage: placeholder.svg`.

---

## 3. Themes, strongest and weakest

### Recurring themes (what you actually write about)
1. **Reliability at system boundaries:** messaging semantics, outbox, idempotency, Dapr pub/sub and state, queue isolation. This is 7 posts and your clearest centre of gravity.
2. **Node.js / NestJS backend engineering:** 8 posts use NestJS or Node as the vehicle.
3. **Edge and request-path security:** TLS termination, the AI WAF, presigned uploads.
4. **Containers and Kubernetes operations:** Docker ×2, Dapr on K8s, k9s.

"AI" appears in the site tagline, the hero, the author bio and JSON-LD, yet only the WAF series touches ML and **no post mentions RAG or agents**. The site claims an identity that the archive doesn't support.

### Strongest posts
1. **Transactional Outbox:** a concrete failure narrative for each trap (ghost rows, bloat, ordering, WAL retention), a sensible scale-based recommendation, and an honest "the outbox only solves half" ending. It reads like experience.
2. **Idempotency:** the `SETNX` crash-window diagram is the most quotable idea on the site. The "derive the downstream key" point and the Stripe 24-hour retention caveat are non-obvious and correct.
3. **WAF Part 2:** the circuit-breaker-as-attack-surface argument is the kind of insight your guide asks for.

They share three things: they start from a failure, trace a mechanism, and end on a decision rule.

### Weakest posts
1. **TLS in Node.js:** the central claim is false on Node 22, and the post is too short to recover.
2. **Docker Part 1:** introductory material, against your own stated bar.
3. **Dapr Part 1:** a restatement of the docs with marketing adjectives.
4. **k9s:** a tool guide with typos and a wrong mechanism in its one deep section.

They share three things: they start from a tool rather than a problem, they make assertions instead of showing evidence, and they could have been written without production experience.

---

## 4. Technical accuracy findings

Your `AGENTS.md` says: _"Publishing plausible-but-wrong config under a 'production hardening' heading is worse than publishing nothing."_ By that standard these are the highest-impact items on the site, above any visual problem. Phase 7 will fix them. They are listed now so you can decide whether any post should be unpublished or annotated in the meantime.

### 4.1 Verified by reproduction

| Post | Claim | What actually happens | How verified |
|---|---|---|---|
| TLS | Passing the intermediate in `ca` means "Node only sends the leaf", so mobile breaks | On Node 22.22 the server **sends both certs** and verification succeeds, because OpenSSL completes the chain from the CA store. `cert` concatenation is still the documented and clearest form, but the "trap" as written doesn't exist on current Node. | Generated root → intermediate → leaf with OpenSSL; ran `https.createServer` three ways; `openssl s_client -showcerts`: leaf-only = 1 cert (verify error 21), `ca:` = 2 certs (OK), concatenated `cert` = 2 certs (OK). |
| Outbox | `WHERE (hashtext(aggregate_id) % 4) = :worker_index` shards rows across workers | `hashtext` returns a signed int4, so `%` returns −3…3. **37.2% of rows match no worker and are never published.** No error is raised. | Postgres 16: 3,721 of 10,000 rows have a negative remainder. |
| Idempotency | A concurrent retry sees `IN_PROGRESS` and gets `409 + Retry-After` | The claim insert and the business logic share one transaction, so `IN_PROGRESS` is never visible to anyone else. A concurrent `INSERT … ON CONFLICT DO NOTHING` **blocks** until the first transaction commits, then sees `COMPLETED`. The 409 branch and the `DELETE … IN_PROGRESS` cleanup are dead code. The behaviour is safe; the explanation and the "200 ms stampede" section are wrong, and it holds a pooled connection plus a row lock for the whole request. | Postgres 16: second insert returned after 2.54 s (the first transaction slept 3 s), with no row. |
| WAF Pt 2 | `request_uri()` opens and closes a TCP connection per request, causing `TIME_WAIT` exhaustion | `request_uri` calls `set_keepalive(keepalive_timeout, keepalive_pool)` unless you pass `keepalive = false`. The section's premise is false. | Read `lib/resty/http.lua` on `ledgetech/lua-resty-http` master (lines 978–985). |
| Idempotency | Mermaid sequence diagram | The site has no Mermaid support; readers see raw `sequenceDiagram` source. | Built HTML contains `data-language="mermaid"`. |

### 4.2 High-confidence errors (not reproduced; verify before republishing)

- **WAF Pt 2:** the `client_body_buffer_size` default is two memory pages: 8 KB on x86-64, 16 KB only on some other 64-bit platforms (nginx docs). The post says "16 KB on 64-bit systems".
- **WAF Pt 2:** after the body fix, the padding bypass **still works**. The tokenizer truncates at `max_length=512`, so a payload after ~2 KB of junk is never seen by the model. This is the most important missing edge case in the series.
- **WAF Pt 2:** `ngx.location.capture` and `ngx.timer` are listed as "cosockets" (they are not), and `ngx.location.capture` is proposed as a non-blocking way to read a spooled body. That is doubtful.
- **S3:** `https://my-bucket.s3.us-east-1.amazonaws.com/...` is labelled path-style. It is virtual-hosted style; path-style puts the bucket in the path.
- **S3:** "bucket policy … `s3:content-length-range`": `content-length-range` is a POST-policy condition. To my knowledge there is no bucket-policy condition key that limits a `PutObject` body size. If that holds, the recommended fix doesn't exist.
- **S3:** the claim that signing `content-length` "breaks every browser upload" is doubtful. With a `File`/`Blob` body the browser sets an exact `Content-Length`. Needs a real browser test.
- **S3:** `confirm-upload` accepts any `storageKey` without checking the `uploads/{userId}/` prefix, so one user can confirm another user's object (IDOR).
- **Dapr Pt 3:** CloudEvents is a CNCF spec, not W3C. `traceparent` is the W3C one.
- **Dapr Pt 3:** the claim that sidecars cache secrets "with configurable TTLs" is likely false for Dapr's secret API.
- **Dapr Pt 4:** the claim that a slow collector makes the sidecar apply backpressure to the app is doubtful; OTel exporters drop spans when their queue is full.
- **k9s:** `capabilities`, `readOnlyRootFilesystem` and `allowPrivilegeEscalation` are container-level fields, so ephemeral containers don't inherit them. What actually blocks netshoot is pod-level `runAsNonRoot` or Pod Security Admission. `kubectl debug --profile` is the real control and isn't mentioned. In the plugin, `--target=$NAME` passes the pod name where a container name is expected.
- **Messaging / Outbox consumer snippet:** a crash (OOM, SIGKILL) between the claim and the side effect leaves a permanent `IN_PROGRESS` row, so redeliveries no-op forever. A DB error after a successful charge deletes the claim, so the retry charges twice. It needs a lease (`claimed_at` plus a timeout) **and** a provider idempotency key — which is the idempotency post's own Pattern 3.
- **Strategy:** BullMQ `jobId` deduplicates *enqueues*; a retry of the same job reuses the same `jobId`, so it doesn't prevent the duplicate SMS described. BullMQ's default `attempts` is 1, not 5.
- **Outbox:** dropping a partition takes a strong lock on the parent (hence `DETACH PARTITION … CONCURRENTLY` in PG 14+), so "2 ms" glosses over blocking the poller. The post also misses the commonest real cause of outbox bloat: a long-running transaction or stale replication slot holding back the `xmin` horizon so autovacuum *cannot* clean.
- **Docker Pt 2:** the musl thread stack-size SIGSEGV claim doesn't fit Node: libuv and worker threads set their own stack sizes. Debian's `dash` may exec the final command in `sh -c`, which weakens the shell-form SIGTERM claim on `node:20-slim`. Both need a test.

### 4.3 Cross-cutting editorial problems

- **Editorial residue in published text (5 places):** S3 L352 ("The original version of this service…"), Dapr 2 L259 ("an earlier draft of this module"), Dapr 4 L430 ("the mistake this section originally shipped"), WAF 2 L92 and L258. These read as a reviewer's notes to the author, and they tell readers the post once shipped broken code.
- **Numbers without provenance:** Docker sizes and pull times; outbox "50 MB → 30 GB", "800 ms vs 2 ms", the 100 and 500 events/sec thresholds; WAF "< 0.05 ms"; S3 "event loop past 2,000 ms". Each needs a method, a source, or a `[TODO]`.
- **Almost no citations:** zero links to RFCs, specs, docs or issue trackers across 15 posts, despite `AGENTS.md` requiring them for version-sensitive claims.
- **Inconsistent series:** Dapr ports (3501 vs 3500), app IDs (`pay-app` / `payment-app`), paths (`libs/dapr` vs `./dapr`), undefined DI tokens; Docker 130/140/142 MB; Outbox "50-line" in the body vs "100-line" in the title.
- **Missing cross-links (required by `AGENTS.md`):** Strategy ↔ Idempotency; Dapr 2 (retrying payment POST) → Idempotency; Dapr 3 (publish after write, at-least-once subscriber) → Outbox and Idempotency; TLS ↔ WAF (both about where TLS terminates).
- **Formula fatigue:** "🔍 Deep Dive", "⚠️ Pitfall", "Symptom → cause → fix" and "claims to verify, not boxes to tick" recur until they read as template rather than voice.
- **Titles:** "Part N:" is baked into titles that also get a series badge. Several slugs no longer describe their post (`docker-production-traps-edge-cases` is the multi-stage post; `architecting-lightweight-docker-builds` is fundamentals; `demystifying-ssl-tls-node-https`). Slugs must not change, but titles can.
- **`updateSummary` is an internal changelog** ("Refactored to be significantly more compact…"), shown to readers and prepended to RSS descriptions.

---

## 5. UI / UX audit (ranked by impact)

Screenshots: desktop and mobile, light and dark, of `/`, `/blog/` and two posts.

| Rank | Area | Problem | Evidence |
|---|---|---|---|
| 1 | **Identity** | The homepage is a name, a generic title ("Distributed Systems & AI Engineer… agentic RAG") and a decorative fake-terminal card. There is no about, no projects and no proof of work. A hiring manager learns nothing concrete in 60 seconds, and the AI/RAG claim isn't backed by any post. | `src/pages/index.astro` L44–107 |
| 2 | **Mobile header** | At 390 px the nav (Home, Publications, GitHub, LinkedIn, theme) overflows: **the theme toggle is clipped off-screen**, the name wraps to two lines, and the page scrolls 1 px sideways. 360 px devices will be worse. | `scrollWidth 391 > 390`; offenders `NAV`, theme `BUTTON` |
| 3 | **Post page above the fold** | At 1440×900 the first paragraph starts at ~y = 835. Above it sit the breadcrumb, category pill, title, dek, meta row, tag row and series banner. The author appears three times (meta, right rail, bio card) and tags twice. The right rail is mostly empty after the first screen. | `desk-light-post.png` |
| 4 | **Rendering gaps** | No Mermaid, so raw diagram source is shown. Diagrams elsewhere are box-drawing ASCII in `<pre>`, which is unreadable for screen readers and scrolls sideways on mobile. No filename labels, line highlights or footnote styling. | §4.1 |
| 5 | **Taxonomy** | `category` is `engineering` on 15/15 posts yet shown on every card, breadcrumb and JSON-LD item. 8 tags are used once (`tls s3 redis rabbitmq observability grpc gcp azure`), and `backend` (8) and `architecture` (7) are too broad to navigate by. Tag, series and category views are query-string filters, so there are **no indexable topic pages**. | tag counts |
| 6 | **Index cards** | `line-clamp-2` combined with `flex-grow` leaks a half-visible third line on several cards. Each card stacks date, update badge, series badge, category and every tag, so there is a lot of chrome per title. Three equal columns treat a 900-word post the same as a 2,700-word one. | `desk-light-index.png` |
| 7 | **Navigation** | Prev/next is global chronological ("Previous publication"), so it links Docker to Dapr. There are no related posts, no "start here", and the site calls blog posts "Publications". | `[...slug].astro` L4–25 |
| 8 | **SEO** | Canonical is `/blog/foo` but the sitemap lists `/blog/foo/`, and `/blog/` is canonicalised with a slash, so the trailing-slash policy is inconsistent. Every page shares one `default-og.png`. JSON-LD breadcrumbs point at `/blog?category=engineering`. RSS is 1.0 MB with full HTML and no `lastBuildDate`. | built HTML, `sitemap-0.xml` |
| 9 | **Performance** | Render-blocking Google Fonts CSS from two origins (Inter + JetBrains Mono) with `display=swap` risks FOUT and layout shift. There are three full-viewport decorative layers (fixed SVG `feTurbulence` noise, dots, aurora) plus `backdrop-blur` on the header and cards. The scroll listener isn't `passive` and writes `width` on every event. Lighthouse is deferred to Phase 9; the sandbox blocks Google Fonts, so local numbers would be misleading. | `BaseLayout.astro`, `global.css` |
| 10 | **Accessibility** | Good: skip link, `:focus-visible`, landmarks, one `h1`, reduced-motion handled globally. Problems: the search input has only a placeholder for a label; the `ShareWidget` emits a dead `is:inline` script (it targets IDs that don't exist) twice per page, and both copies use `instance="inline"`; widespread 10–11 px mono labels; perpetual `animate-pulse` dots on "Updated" badges; the breadcrumb's current item lacks `aria-current`; the theme button has both `aria-label` and an `sr-only` span. | components |
| 11 | **Visual noise** | Pills, badges, mono uppercase labels, cards inside cards, emerald "Article Revised" boxes and gradients all compete. The typography is decent (17 px / 1.75, ~656 px measure ≈ 75 characters), but the chrome around it is louder than the prose. | screenshots |

What already works and should be kept: the reading measure, dual-theme Shiki, the sticky ToC with scroll-spy, the series data model, the security headers, the `socialImage()` raster fallback, draft filtering, and the near-zero-JS architecture.

---

## 6. What this blog is today vs. what it could become

**Today:** a technically ambitious, well-scaffolded blog that has outgrown its own production process. Fifteen posts landed in about four months. The best of them (Outbox, Idempotency, WAF Part 2) contain real insight, but the archive mixes those with intro material and with confident claims that don't survive a quick reproduction. The design spends its effort on decoration and badges, and the identity ("Distributed Systems & AI Engineer") is broader than the work.

**Could become:** a focused, verifiable notebook on **how backend systems fail at their boundaries** — between a service and its database, broker, sidecar, network edge, or a client that retries — written by someone who reproduces the failure before explaining it. The differentiator isn't more topics. It's **evidence**: every post carrying a minimal reproduction, real output, version pins and citations. Three of this audit's findings took under a minute each to reproduce, so that standard is affordable.

---

## 7. Open questions for you (needed before Phase 2)

1. **Fill the placeholders:** current-design description, target readers, desired impression, and 2–4 sites you admire.
2. **"AI Engineer" positioning:** do you have AI/RAG work you plan to write about, or should the positioning drop it until the archive supports it?
3. **The verified errors:** should I add a short correction note to the affected posts now, ahead of the redesign, or hold everything for Phase 7?
4. **Experience claims:** several posts say "I built", "our notification engine", "during penetration testing". Which of these were real production systems versus personal or lab projects? This decides how Phase 8 (Projects) can present them truthfully.
