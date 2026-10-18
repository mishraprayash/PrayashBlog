# Phase 10: Final review

## Update: the magazine redesign

The first design was replaced after review, because it looked like every other backend blog. What's live on this branch now:

- **Design:** a bold editorial magazine with one colour per topic (orange messaging, blue PostgreSQL, green running services, violet network edge), huge Archivo headlines, Newsreader text and Plex Mono labels. Light and dark themes both work. See `04-design-system.md`.
- **Covers:** every post has an animated SVG cover drawn from its subject (the outbox losing a dual write, three retries collapsing into one row, the missing TLS intermediate, and so on).
- **Scroll diagrams:** every post has one. They come from a numbered list in the markdown, so the steps stay real text that you can edit. The diagram beside them changes as you scroll, and the build fails if the list and the diagram disagree on the number of steps.
- **Labs:** the Outbox post has an interactive one (the ghost row), where you step the two transactions and the relay yourself and switch the query.
- **Short headlines:** each post has a `headline` for the hero, cards and social card. The long titles stay as the page title for search.
- **Motion control:** a pause/play button in the header. It defaults to paused under reduced motion, and off-screen animation is always paused.
- **Social cards:** these are in the new style, in the post's colour.

Drawing a diagram for each post meant reading every post closely. The doubtful claims that turned up are listed in `07-content-plan.md` under "Found while drawing the diagrams". The diagrams avoid those claims, but the post text still contains them.

Everything below this section is the review of the first design. Its checklist still applies.

---

_Walked through on the built site (local preview of the branch), 18 Oct 2026._

## Three visitors

### A hiring manager with 60 seconds

**Path:** home → Projects → one post.

- **What works:**
  - The home page says what you do in two sentences, links to About and Projects in the first screen, and then gives three hand-picked posts, each with a one-line reason to read it.
  - The header has Writing, Projects and About on every page.
  - The posts show depth quickly: the first paragraph is above the fold, and the revision notes show you correct your own work.
- **Friction found and fixed:**
  - Projects was only reachable from a link, so the home page now has a Projects section after "Start here".
  - The old site claimed "AI Engineer", with no posts behind it. That's gone.
- **Friction still open (yours to fix):**
  - Both project pages and About are mostly `[TODO]` (24 markers, listed by `npm run todos`). Until they're filled, this visitor sees the highlighted placeholders, which is deliberate: it's better than invented facts, but it isn't ready to show anyone.

### An engineer arriving from Google on one post

**Path:** a search result → the post → the next thing to read.

- **What works:**
  - **Search result:** the social card and the description (now under 160 characters, so search engines don't truncate it) say what the post is about.
  - **Above the fold:** on desktop, the first paragraph starts at 466 px. Mobile is 569–602 px depending on title length.
  - **Code:** blocks are readable in both themes, and have a copy button and a language or filename label.
  - **Tables:** they scroll inside their own box; nothing scrolls the page sideways at 360 px.
  - **What next:** at the end come the series navigator (where there is one), tags, Copy link, three related posts and a "More on…" link.
- **Friction found and fixed:**
  - Two posts repeated the series list by hand under the automatic one. Replaced with a one-paragraph pointer, or removed.
  - Long descriptions pushed mobile text down, so all 15 were rewritten under 160 characters, and the schema now enforces that limit.
  - The mobile title and description sizes were tightened slightly.
- **Friction still open:**
  - Several posts still carry the problems listed in `07-content-plan.md` (most importantly the S3 size-limit advice, which needs checking against AWS).
  - Posts other than Outbox and Idempotency still use the old voice and ASCII diagrams.

### A returning reader

**Path:** home → "Recent" → Writing → RSS.

- **What works:**
  - "Recent" and the Writing page list posts by publish date, so revising a post no longer pushes it to the top. Revised posts get a small "revised" marker, and each post's "Revised" line expands to say what changed.
  - The RSS feed has `lastBuildDate` and full text, and the revision summary shows in the item description.
- **Friction:**
  - There's no way to follow by email. Deliberately left out until you decide to run a newsletter.

## Where the quality bar stands

| Check | Result |
|---|---|
| Lighthouse, mobile, local build | Home, Writing, About: 100 / 100 / 100 / 100. Outbox, Idempotency, Dapr part 4: performance 96–98, the rest 100. |
| Layout shift | 0 on list pages; ≤0.021 on posts. That's the web font swapping in on a machine without Georgia or Courier New. Readers on macOS and Windows have both, and the metric-matched fallbacks apply there. |
| axe-core (WCAG 2.1 AA + best practice) | No violations on all 45 pages, light and dark |
| Horizontal scroll, JS errors, one `<h1>` | None, at 360 px and 1440 px (`npm run test:pages`) |
| Contrast | Every text colour ≥ 4.5:1 in both themes; computed in `04-design-system.md` |
| SEO | Unique titles and descriptions, canonical URLs that match the sitemap, Open Graph and Twitter cards with a generated image per post, JSON-LD `BlogPosting` + `BreadcrumbList`, `sitemap-index.xml`, `robots.txt`, RSS |
| CSS / JS | ~29 KB CSS (was 75 KB). JS only for the theme toggle, contents highlighting and copy buttons. |

## What you need to do

**Before merging to `main`:**

1. **Fill in the `[TODO]`s.** `npm run todos` lists all 25. The ones that matter most:
   - **Project names, your role, and the problem each project solved:** `src/content/projects/*.md`.
   - **Background, what you do now, and contact:** `src/content/pages/about.md`.
   - **One sentence each in the Outbox and Idempotency posts** saying where you hit these problems.
2. **Add an architecture figure** for the main project (a hand-drawn SVG or a cleaned-up whiteboard photo).
3. **Read the two rewritten posts** (Outbox, Idempotency) and change anything that doesn't sound like you. They keep your structure and claims, but the wording is new.
4. **Check the "Start here" one-liners** in `src/pages/index.astro`. They're written to sound like you recommending your own posts; adjust them.
5. **Deploy a Vercel preview and check the redirects:**
   - `/blog?tag=kafka` → `/tags/kafka`
   - `/blog?series=distributed-systems` → `/series/reliable-messaging`
   - `/blog/foo/` → `/blog/foo`

   They're written to Vercel's documented `has` syntax but can only be confirmed on Vercel.
6. **Re-run the reproductions you want to claim personally.** Where a post now shows test output (Node 22 TLS, Postgres 16, the Werkzeug keep-alive check), the runs were done while preparing these changes, and the text is worded neutrally for that reason.

**After merging:**

7. **Work through `docs/redesign/07-content-plan.md`**, highest priority first:
   - S3 size limits
   - the Strategy post's idempotency and OCP claims
   - the Dapr inconsistencies
   - the k9s debug-container section
8. **Write the PostgreSQL posts** (ideas 1–3 in the content plan), so that pillar has its own.
9. **Analytics, if you want them:** a privacy-friendly option (Plausible, Fathom, or Vercel Web Analytics) adds one small script. Nothing is installed now.
10. **Search Console:** submit `https://prayashmishra.com/sitemap-index.xml` once the new URLs are live.

**Commands:**
- `npm run build`: build, including the content checks (unknown tags, series gaps, broken related links)
- `npx astro check`: types
- `npm run test:pages`: overflow, JS errors, headings and axe on every page; needs a Chromium. Set `CHROMIUM_PATH` if Playwright doesn't manage one.
- `npm run todos`: placeholders left to fill
