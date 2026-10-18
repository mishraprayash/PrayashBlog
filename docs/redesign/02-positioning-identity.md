# Phase 2: Positioning and identity

_Decisions from Phase 1 review (2026-10-18): go with the assumed audience; drop "AI Engineer"; corrections applied (commit `3dc4b56`); the systems in the posts come from a recent project you worked on. New hard requirement: **the blog must read like one person wrote it, not like generated text.**_

---

## 1. Positioning

**Statement**

> Prayash Mishra writes about how backend systems fail where they meet databases, message brokers and the network, and shows each failure reproduced and each fix tested.

**Why this one.** It names the job (backend), the territory your best posts already cover (the boundaries between a service and the things it depends on), and the one thing that can set the site apart: evidence. "Distributed systems" alone is a crowded label. "Shows the failure" is a promise a reader can check, and the Phase 1 corrections show the cost of not keeping it.

**Short form** (homepage, meta description, social card):

> Backend engineer. I write about how distributed systems break at the seams, and what actually fixes them.

**What it deliberately leaves out:** AI (until there's work to show), "full-stack", and any list of technologies in the headline. The stack belongs on the About page and in each post.

---

## 2. Content pillars

These replace the current `category` field, which is `engineering` on all 15 posts and tells readers nothing. Each post gets exactly one pillar. Tags stay for finer-grained topics.

| Pillar | What it covers | Existing posts | Gap / next |
|---|---|---|---|
| **Messaging and delivery** | Queues, streams, outbox, idempotency, retries, ordering, consumer design | Message Queues · Outbox · Idempotency · Event Dispatching (Strategy) | Retries and backoff; poison messages and DLQs done properly; Kafka consumer rebalances |
| **PostgreSQL under real load** | Locking, MVCC, vacuum, replication slots, transaction design, things the ORM hides | (Outbox and Idempotency lean on it heavily) | The growth pillar. Locks and `lock_timeout`; the xmin horizon; connection pool sizing |
| **Running services** | Containers, Kubernetes, sidecars, deploys, probes, observability | Docker ×2 · Dapr ×4 · k9s | Graceful shutdown end to end; readiness vs liveness; what a sidecar really costs |
| **The network edge** | TLS, proxies, request-path security, uploads, anything between the client and your code | TLS · AI WAF ×2 · S3 presigned uploads | Timeouts across a proxy chain; HTTP keep-alive between services |

Node.js / NestJS is your recurring stack, not a pillar. It shows up as a tag and in the About page, so someone searching for NestJS still finds the posts, but the site doesn't read as a framework blog.

**Pillar assignment for current posts** (applied in Phase 6 as a schema change):

| Post | Pillar |
|---|---|
| Message Queues, Topics, and Event Streams | Messaging and delivery |
| Transactional Outbox | Messaging and delivery |
| Idempotency in Distributed Systems | Messaging and delivery |
| Scaling Multi-Channel Event Dispatching | Messaging and delivery |
| Docker Part 1, Part 2 | Running services |
| NestJS + Dapr Parts 1–4 | Running services |
| k9s | Running services |
| TLS in Node.js | The network edge |
| AI WAF Parts 1–2 | The network edge |
| S3 Presigned Uploads | The network edge |

PostgreSQL has no primary post yet. Outbox and Idempotency get a `postgresql` tag, and the pillar page says honestly that it's where the next posts go.

---

## 3. Voice and tone

### The voice in one paragraph

An engineer explaining something to a colleague they respect, after having actually run it. First person. Plain words. Specific about versions, numbers and what was tested. Willing to say "I don't know" or "I haven't tried this on X". Opinionated only where the post has earned it. The writing should feel like it came from someone who was there, which means it includes the things only someone who was there would know: what they tried first, what didn't work, what surprised them.

### Why the current posts sound generated

This isn't about any single phrase. It's that the same handful of moves repeat across all 15 posts, and together they read like a template. Counts are from the current files.

| Pattern | Examples from the posts | Why it reads as generated |
|---|---|---|
| **The setup–reveal staccato** | "It passes code review. It runs fine in staging. Then, on a random Tuesday…" (Outbox) · "It takes twenty lines of code. It passes unit tests. And in production, it will silently corrupt your business data." (Idempotency) · "It looks completely sound. It is also guaranteed to lose data." (Outbox) | A rhythm, not a thought. Once a reader notices it, they stop trusting the content around it. |
| **Announcement openers** | "Here is why:", "Here is how I architected…", "Here is what actually happens…" (9 instances) | Tells the reader something is coming instead of saying it. |
| **Moral-of-the-story closers** | "The lesson is simple:", "The rule generalises:", "The honest framing:", "If you take one thing from this post…" | Every section ending on an aphorism is a strong tell. People usually just stop when they've made the point. |
| **Bold on every other phrase** | 72 bold spans in Message Queues; 44 in S3; 37 in Docker Part 2 | When everything is emphasised, nothing is. |
| **Emoji labels and fixed formulas** | 21 headings with 🔍 / ⚠️; "Deep Dive:"; "Symptom → cause → fix:"; "claims to verify, not boxes to tick" (3 posts) | The same scaffolding in every post reads as a template, not as a person deciding how to explain this one thing. |
| **Hype and absolutes** | "blistering throughput", "Infinite Scalability", "bulletproof", "elegant", "enterprise-grade", "Exactly-once delivery is a marketing myth" | Senior engineers don't write like this about their own work. |
| **Invented universality** | "Every team that moves to microservices eventually reinvents the same bug." · "Almost every online tutorial recommends…" · "Most engineers still triage…" | An unsupported claim about everyone, in place of a true claim about you. |
| **Stock drama** | "at 3 AM", "at 2 AM on Sunday", "a random Tuesday", "Enter **k9s**" | Cliché scene-setting. |
| **Em dashes as default punctuation** | 82 across the posts | A strong current tell on its own. Use commas, colons, parentheses or a new sentence. |
| **Reviewer notes left in** | "the mistake this section originally shipped", "an earlier draft of this module" (5 places) | Reads like a conversation the reader wasn't part of. |

### Do / Don't

| Do | Don't |
|---|---|
| Start with the specific problem, the code or the error message | Start with a scene ("Picture this…", "It's 3 AM…") or a sweeping claim about the industry |
| Say what you were working on, as far as it's true ("On a recent project, our order service…") | Imply production scale, team size or incidents you can't back up |
| Show what you tried first and why it didn't work | Present the final answer as if it were obvious all along |
| Give numbers with how they were measured, versions included ("p99 went from 41 ms to 9 ms on a 4-vCPU box, Node 22, 200 rps") | Give round numbers with no source ("cuts latency from 25 s to 3 s") |
| Link the spec, the doc page, the source line or the bug report | Assert defaults and behaviour from memory |
| Let sentence length vary because the thought varies | Fall into the short–short–long rhythm |
| Use bold for at most one or two things a reader must not miss | Bold key phrases throughout |
| End a section when the point is made | End every section with a lesson |
| Admit limits ("I haven't tested this on Kafka 4") | Hedge everything, or claim everything |
| Use contractions and ordinary words (use, fix, check, break) | Use "leverage", "utilize", "robust", "seamless", "elegant", "game-changer" |
| Keep correction notes in the revision box at the top, dated | Narrate corrections inside the body |

### Before and after

From the opening of the Outbox post, as it is now:

> Every team that moves to microservices eventually reinvents the same bug.
>
> You save a record to PostgreSQL, and right below it, you fire an event to Kafka or SQS: […]
>
> It passes code review. It runs fine in staging. Then, on a random Tuesday, a network blip hits the message broker. The database committed, but the event was never sent.

The same opening in the target voice:

> This code has a bug that won't show up in review or in staging:
>
> ```typescript
> await db.orders.create({ data: order });
> await kafka.send({ topic: 'orders', message: order });
> ```
>
> If the Kafka call fails after the insert commits, the order exists and nothing downstream hears about it. Billing never charges, inventory never reserves, and no error shows up anywhere, because the database call already returned successfully. [TODO: if this happened on your project, one sentence on how you found out.]

The facts are the same. The second version leads with the thing itself, makes a claim about this code rather than about every team, and leaves room for one true detail from your experience. That detail is what no generator can supply.

### Rules for claims of experience

Your answer to Phase 1's question 4 was that these ideas come from a recent project. So:

- First-person experience is welcome and should get **more** specific, not less: what the system did, what broke, what you changed.
- Where a post currently says "our notification engine", "during penetration testing" or "a schema that has survived heavy production traffic", Phase 7 keeps the claim but marks each place with `[TODO: …]` for one concrete detail you can confirm (scale, timeframe, what you saw). I won't invent any of them.
- Anything I reproduce while editing (as with the Phase 1 corrections) is written neutrally ("Here's what Node 22 does…"), never as "I tested". The posts are under your name, and you should re-run anything you want to claim personally.

---

## 4. Design directions

What all three directions drop: the aurora gradients, dot field and noise texture, the fake terminal card, pill badges on every element, the card grid as the default layout, and decorative mono labels. Together these are the look of a generated portfolio template, and most of them compete with the text.

What all three keep: the ~70-character measure, light and dark themes, dual-theme code highlighting, near-zero JavaScript, and a sticky table of contents on long posts.

Specimens of all three, rendered with real text from the Outbox post, are in `docs/redesign/02-design-directions.html`.

### A. Engineering notebook (recommended)

- **Mood:** a well-kept notebook published as-is. Warm paper, black ink, one red pen. Quiet, personal, unhurried. Closer to a book than a dashboard.
- **Typography:** **Source Serif 4** for body and headings (variable, open licence, designed for long-form screen reading, with real italics and old-style figures); the **system UI stack** for small interface text (nav, dates, metadata), so no second text font downloads; **JetBrains Mono** for code. Fonts self-hosted.
- **Color:** off-white paper (`#FAF8F4`-ish), near-black ink, warm grey for secondary text, and a single **red-ink accent** used for links, the active ToC item and warnings. Dark mode is warm charcoal, not blue-black. Exact AA-checked values come in Phase 4.
- **Signature elements:** side notes in the margin on wide screens (version caveats, "I haven't tested X"), which become footnotes on mobile; figures with numbered captions; a plain dated revision note at the top of revised posts.
- **Why it fits:** the strongest thing you can signal is that a person wrote this and stands behind it. A serif reading face and a single ink accent read as authored. Side notes give the caveats and version pins your posts need a home that doesn't interrupt the main argument.
- **Risk:** serif body plus heavy code needs careful sizing so the mono doesn't look oversized. Side notes need a clean fallback on narrow screens. Both are solvable in Phase 4.

### B. Plain text

- **Mood:** utilitarian. The page looks like it was written in a text editor and published. No decoration at all.
- **Typography:** system UI stack for everything, system mono for code. Zero webfonts.
- **Color:** black on white, standard blue links, visited purple. Dark mode inverted.
- **Signature elements:** a list of dated titles as the homepage; nothing else.
- **Why it fits:** maximally honest and fast (easy Lighthouse 100). Engineers respect it.
- **Risk:** reads as unfinished to a hiring manager. Nothing makes it memorable, and long code-heavy posts with tables and diagrams need more structure than it offers.

### C. Technical manual

- **Mood:** an RFC or a datasheet. Precise, numbered, cool.
- **Typography:** **IBM Plex Sans** for body and headings, **IBM Plex Mono** for code and labels.
- **Color:** cool light grey paper, graphite text, and a **safety-orange** signal color reserved for failure states and warnings.
- **Signature elements:** numbered sections (§3.2), figures and tables as first-class objects ("Fig. 4"), margin labels.
- **Why it fits:** matches the failure → mechanism → fix structure, and makes diagrams and comparison tables look intentional.
- **Risk:** cold and corporate. It pulls against the "a person wrote this" requirement, which is now the top priority.

### Recommendation

**A, Engineering notebook, borrowing C's discipline about figures and captions.** The new requirement settles it. B is honest but forgettable, and C is precise but impersonal. A is the only direction where the design itself argues that a person wrote the page. It also gives the caveats and evidence the posts need a natural place to live (side notes), which helps the writing as much as the look.
