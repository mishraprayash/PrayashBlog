# Phase 3: Information architecture

_Approved in Phase 2: the positioning statement, the four pillars, and design direction A (Engineering notebook)._

---

## 1. Sitemap

```
/                          Home
/blog                      Writing (all posts)            ← URL kept, nav label becomes "Writing"
/blog/{slug}               Post                           ← all 15 URLs unchanged
/topics/{pillar}           Pillar page (4)
/tags/{tag}                Tag page
/series                    All series
/series/{id}               One series, in order
/projects                  Projects
/projects/{slug}           One project
/about                     About
/rss.xml                   Feed                           ← URL kept
/sitemap-index.xml         Sitemap                        ← URL kept
/robots.txt
/404
/search                    Later milestone (see §5)
```

**Header navigation:** Writing · Projects · About, plus an RSS link and the theme toggle. Three text links fit at 360 px, which fixes the mobile overflow from the Phase 1 audit. Topics, tags and series are reached from the Writing page and from inside posts, not from the header.

**Left out on purpose:**
- **/now:** it goes stale within weeks, and a stale Now page tells a reader the site is abandoned. Add it later only if you'll keep it current.
- **/uses:** low value for this audience.
- **A separate /writing URL:** it would mean redirecting the existing `/blog` index for no reader benefit, so the index stays at `/blog`.

---

## 2. Pages

| Page | Purpose | Primary user goal | Must contain |
|---|---|---|---|
| **Home** `/` | Say who you are and prove it within one screen | Hiring manager: "is this person good?" Returning reader: "what's new?" | One-sentence positioning; a "Start here" list of 3 posts with one line on why each matters; the latest 5 posts (date, title, pillar); the 4 pillars with post counts; links to Projects and About. No hero image, no terminal card. |
| **Writing** `/blog` | The complete archive, scannable | Find a post by topic or date | All posts grouped by year: date, title, pillar, reading time. Pillar links across the top; series links below them. No card grid, no tag cloud. |
| **Post** `/blog/{slug}` | Teach one thing well | Understand the problem and leave with a fix they trust | Title, dek, date, revision note (if any), reading time, pillar, tags; table of contents for long posts; prose with figures, side notes and footnotes; series navigator (if in a series); 3 related posts; RSS prompt. Designed in detail in Phase 5. |
| **Pillar** `/topics/{pillar}` | Show depth in one area | "What has this person written about Postgres?" | 2–3 sentences on the pillar in your voice; its posts newest first; the series within it; for PostgreSQL, an honest note that dedicated posts are coming, plus the posts that rely on it heavily. |
| **Tag** `/tags/{tag}` | Narrow navigation | "Everything on Kafka" | Tag name, post count, post list. Exists only for tags on 2+ posts. |
| **Series index** `/series` | Show multi-part work | Pick a series to read in order | Each series: title, one-line description, number of parts, total reading time. |
| **Series** `/series/{id}` | Read a series in order | Start at part 1, continue | Description, ordered parts with a one-line summary each, total reading time. |
| **Projects** `/projects` | Make invisible backend work visible | Hiring manager: "what has this person built?" | One entry per project: problem, your role, stack, one outcome, links. Designed in Phase 8. |
| **Project** `/projects/{slug}` | The full story of one build | Judge scope and judgement | Problem, constraints, architecture figure, your role, decisions and trade-offs, results, related posts. `[TODO]`s for facts only you have. |
| **About** `/about` | Who you are, in your own voice | Trust and contact | Short story, what you work on, how you think about engineering, stack, contact links. Drafted in Phase 8 with `[TODO]`s. |
| **404** | Recover lost readers | Get somewhere useful | One plain sentence, a link to Writing, and the 5 most recent posts. |
| **RSS** | Follow without social media | Subscribe | Full-text feed, `lastBuildDate`, reader-facing revision notes. |

---

## 3. How posts are organised and found

### Pillar: one per post, required

This is a new `pillar` field: an enum of `messaging`, `postgresql`, `running-services`, `network-edge`. It replaces `category`, which is `engineering` on all 15 posts. The assignment table is in the Phase 2 document. `category` is removed from the schema once nothing reads it.

### Tags: a controlled vocabulary of 2+ posts each, at most 4 per post

The current 33 tags include 8 used on a single post and 4 too broad to navigate by (`backend` on 8 posts, `architecture` on 7). Proposed vocabulary, every tag on at least two posts:

| Tag | Posts |
|---|---|
| `nestjs` | Strategy, Dapr 1–4, S3 |
| `microservices` | Dapr 1–3, Messaging, Outbox, Idempotency |
| `dapr` | Dapr 1–4 |
| `kafka` | Dapr 3, Messaging, Outbox |
| `security` | TLS, WAF 1–2, S3 |
| `docker` | Docker 1–2, Dapr 4 |
| `node` | TLS, Docker 1–2 |
| `postgresql` | Outbox, Idempotency |
| `queues` | Strategy, Messaging |
| `kubernetes` | Dapr 4, k9s |
| `nginx` | WAF 1–2 |
| `tls` | TLS, WAF 1 |
| `aws` | S3, k9s |
| `typescript` | Strategy, Dapr 2 |

**Dropped:** `backend`, `architecture`, `distributed-systems`, `event-driven`, `devops`, `cloud-native` (each too broad, or now covered by a pillar); `lua`, `waf`, `ml` (always alongside `nginx`); `grpc`, `gcp`, `azure`, `redis`, `rabbitmq`, `s3`, `observability` (single-post tags). Each dropped tag gets a redirect (§4). `AGENTS.md` gets the vocabulary list so new posts reuse it.

### Series: declared in the post, not only in a separate file

Today `src/data/series.ts` lists posts by slug, and `AGENTS.md` warns that a renamed slug silently breaks series navigation. The fix is to have each post declare its own place:

```yaml
series: reliable-messaging
seriesPart: 2
```

Series titles and descriptions move to a small `series` content collection. The build fails if two posts claim the same part of a series, or if a series has a gap. The silent failure becomes a build error.

Series IDs and names are revised to match the new voice. They currently exist only as `?series=` query values, so renaming them is cheap:

| Old id | New id | New title |
|---|---|---|
| `distributed-systems` | `reliable-messaging` | Reliable messaging, end to end |
| `nestjs-dapr` | `nestjs-dapr` | NestJS microservices on Dapr |
| `nginx-ai-waf` | `nginx-ml-waf` | An ML request filter in front of Nginx |
| `docker-mastery` | `docker-node` | Docker images for Node services |

Titles lose their "Part N:" prefix. The series navigator shows the part number, so the title doesn't need to repeat it. Titles change; slugs don't.

### Start here

A curated list of 3 posts on the homepage, set by a `startHere: 1 | 2 | 3` field. This replaces the auto-fallback `featured` slot.

Initial pick, made after the Phase 7 rewrites land:
1. **Transactional Outbox**
2. **Idempotency**
3. **WAF Part 2**

These are your three strongest posts, and together they cover two pillars.

### Related posts: 3 per post, computed with a manual override

- **Computed score:** +2 for each shared tag, +1 for the same pillar. Posts in the same series are excluded, because the series navigator already links them. Ties go to the newer post.
- **Manual override:** a `related: [slug, slug]` field takes precedence. Use it where `AGENTS.md` requires a two-way cross-link, e.g. Strategy ↔ Idempotency.

### Previous / next

Shown only within a series. Outside a series, chronological prev/next is replaced by related posts, because "the post published before this one" is rarely the post a reader wants next. Phase 1 found Docker linking to Dapr this way.

---

## 4. URL plan and redirects

**Unchanged:** `/`, `/blog`, all 15 `/blog/{slug}`, `/rss.xml`, `/sitemap-index.xml`, `/robots.txt`. No post slug changes.

**Trailing slash policy:** no trailing slash, everywhere. Today the post canonical is `/blog/foo`, the sitemap lists `/blog/foo/`, and the index canonical is `/blog/`. The changes:
- `astro.config.mjs`: `trailingSlash: "never"`
- `vercel.json`: `"trailingSlash": false` (308 from `/x/` to `/x`)
- Canonicals, the sitemap and internal links all use the slash-less form.

**Redirects** (in `vercel.json`, matching on the query string; to be verified on a Vercel preview deploy in Phase 6):

| From | To | Why |
|---|---|---|
| `/blog?tag={kept tag}` | `/tags/{tag}` | Tag links in old shares and in search caches |
| `/blog?tag={dropped tag}` | the matching pillar or tag page (`backend`/`architecture` → `/blog`; `distributed-systems`/`event-driven` → `/topics/messaging`; `devops`/`cloud-native`/`observability` → `/topics/running-services`; `lua`/`waf`/`ml` → `/tags/nginx`; `s3` → `/tags/aws`; `redis`/`grpc` → `/tags/dapr`; `rabbitmq` → `/tags/queues`; `gcp`/`azure` → `/tags/kubernetes`) | No dead ends |
| `/blog?series={old id}` | `/series/{new id}` | The homepage currently links these |
| `/blog?category=engineering` | `/blog` | Used in post breadcrumbs and JSON-LD |
| `/blog?q=…` | `/blog` | The client-side search box is going away |

All of these are 301s, except the trailing-slash 308 that Vercel issues itself.

**New:**
- `/topics/{pillar}`, `/tags/{tag}`, `/series`, `/series/{id}`, `/projects`, `/projects/{slug}`, `/about`
- `/og/{slug}.png`: generated social images at build time, Phase 9

---

## 5. Search

Not in the first release. With 15 posts, the Writing page lists everything on one screen and the browser's find works. The current client-side filter adds JS and duplicates what the pillar and tag pages will do.

When the archive passes roughly 40 posts, add **Pagefind** at `/search`. It builds a static index at build time and loads nothing until someone opens the search page. A reserved milestone in Phase 6 covers it.

---

## 6. What changes in the content schema (summary for Phase 6)

| Field | Change |
|---|---|
| `pillar` | **New, required.** Enum of the 4 pillars. |
| `series`, `seriesPart` | **New, optional, together.** Replaces slug lists in `series.ts`. |
| `startHere` | **New, optional.** 1–3. |
| `related` | **New, optional.** Up to 3 slugs, validated against existing posts at build time. |
| `tags` | Validated against the controlled vocabulary; build fails on an unknown tag. |
| `category` | Removed. |
| `featured` | Removed (replaced by `startHere`). |
| `featuredImage` | Kept, optional. When absent, the generated `/og/{slug}.png` is used. |
| `updateSummary` | Kept. Must be reader-facing (a style rule in `AGENTS.md`, not enforced in code). |
