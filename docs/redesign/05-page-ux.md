# Phase 5: Page-by-page UX

_Builds on Phase 3 (pages, URLs) and Phase 4 (tokens, components). Sizes refer to Phase 4 tokens. "Desktop" means ≥1280 px unless stated; "mobile" means 390 px, and everything must also work at 360 px._

Each layout below is a top-to-bottom list of the page's sections, with notes on what changes between screen sizes.

---

## 1. Post page `/blog/{slug}` (the one that matters most)

A reader from Google lands here knowing nothing about you. Within the first screen they should be able to see what the post is about, whether it's current, how long it takes, and that the first paragraph is worth reading. Today the first paragraph starts about 835 px down on a 1440 × 900 screen. **Target: the first paragraph starts above 500 px on desktop and above 560 px on mobile.**

### 1.1 Layout, top to bottom

```
HEADER (56 px, sticky)

── post header ── (single column, left edge aligned with the prose)
  Pillar link · Series line                      system 15 px, --muted
  Title                                          --text-display
  Dek (description)                              --text-dek, --ink-2
  Meta row: 9 Sep 2026 · Revised 18 Oct 2026 ▸ · 11 min read
                                                 system 15 px, --muted

── body grid (Phase 4 §3) ──
  [ToC]        [prose]                            [notes]
  Contents     First paragraph…                   ¹ side note
               …                                  ² side note
               Figure, code, table (may widen to 48rem)

── post footer ── (prose column width)
  Series navigator (if any)
  Tags:  #postgresql · #kafka · #microservices
  "Related" — 3 posts as list rows
  RSS line
  Short author line: "Written by Prayash Mishra. More about me →"

FOOTER
```

**Removed from the current page:** the breadcrumb (the pillar link and the header already say where you are), the category pill, the tag row above the article, the right-hand "Written by" card, the duplicate share widget, the big author bio card, the emerald revision box, and the chronological prev/next cards.

**Sharing:** dropped as buttons. Readers who share use the browser's own share or copy the URL, and the X/LinkedIn intent links are rarely used on technical blogs. If you want one, a single "Copy link" text button sits in the post footer. This is a keep-or-drop decision for you; I've left it out by default.

### 1.2 Reading experience

- **Measure:** the prose column is 34 em, about 66 characters per line (measured).
- **Heading hierarchy:**
  - H1 is the title only.
  - H2s are the post's sections. A build-time check fails on a skipped level (H2 → H4) or an H1 inside markdown.
  - H2s are not numbered automatically. Many current posts number them by hand ("## 1. …"), and the rewrites in Phase 7 decide per post.
  - Each heading gets a `#` anchor link that appears on hover or focus, positioned in the left margin so it never shifts the text.
- **Table of contents:** shown only when the post has 4 or more H2s.
  - **≥1280 px:** sticky in the left column, starting level with the first paragraph. It scrolls independently if taller than the viewport, and the active section is marked.
  - **1024–1279 px and mobile:** a closed `<details>` labelled "Contents (7 sections)", placed between the meta row and the first paragraph. It is not sticky on mobile, because a sticky element there eats reading space.
- **Reading time:** prose words ÷ 230, plus 1 minute per 25 lines of code, rounded up, with a minimum of 1. The current calculation counts code as prose words at 200 wpm, which overstates code-heavy posts.
- **Dates:**
  - **Published:** always shown.
  - **Revised:** shown when `updatedDate` is set, as "Revised 18 Oct 2026 ▸", a `<details>` that expands to the reader-facing `updateSummary`.
  - **Format:** `9 Sep 2026`, unambiguous across locales. The underlying `<time datetime>` holds the ISO value.
- **Long titles:** `text-wrap: balance`, no truncation anywhere on the page.

### 1.3 Technical content

**Code blocks.** Specified in Phase 4; here is how the author writes them:

````md
```ts title="handler.ts" {12-14}
...
```
````

- **`title="…"`** shows a filename bar. Without it, the bar shows only the language and the copy button.
- **`{12-14}`** highlights lines. **`showLineNumbers`** adds a gutter. **`diff`** as the language gives add/remove backgrounds.
- **Overflow:**
  - **Long lines:** scroll inside the block. The block has `tabindex="0"` and an `aria-label` ("Code: handler.ts"), so keyboard users can scroll it.
  - **Edge fade:** a 24 px fade on the right edge appears only when the content overflows. It uses CSS scroll-driven animations, which today only Chromium-based browsers support; other browsers simply show no fade. No JS.
- **Copy button:**
  - **What it copies:** the code without line numbers. `diff` blocks copy without the leading `+`/`-`.
  - **Feedback:** the label changes to "Copied" for 2 s and is announced via `aria-live="polite"`.
  - **Fallback:** if `navigator.clipboard` is unavailable (insecure context), the button selects the code and the label changes to "Press Ctrl/⌘ C".
- **Code that represents output** (`text`, `console`, `log`): no syntax colours, and the language label reads "Output", so readers can tell commands from results. The voice guide asks for real failure output, so this comes up often.

**Diagrams.**
- **Inline SVG** (preferred) or **Mermaid rendered at build time**, wrapped in a `<figure>` with a numbered caption.
- **Wide diagrams:** scroll horizontally on mobile inside the figure, with the caption outside the scroll area so it stays readable.
- **Alt text:** every diagram has a text alternative (`aria-label` or a `<desc>`). A build check fails if one is missing.

**Footnotes and side notes.**
- **Markdown:** `[^1]`. **≥1024 px:** side notes, top-aligned with the line that references them. If two would overlap, the second is pushed down.
- **Below 1024 px:** numbered notes collected at the end of the current H2 section (not the end of the post), so the reader doesn't jump 5,000 words.
- **Back-link:** each note has a back-link (↩) to its reference.

**Tables.**
- **Container:** a scroll container with a visible caption above the table. Header cells use `scope="col"`.
- **Mobile:** tables keep their shape and scroll. No card-reflow tricks, because comparison tables lose their meaning when reflowed.

**Callouts.** The four types from Phase 4. A post with more than one callout per screen is a writing problem, not a layout one; the Phase 7 editorial check flags it.

### 1.4 Navigation at the end of a post

1. **Series navigator** (only for series posts):
   - The ordered list of parts, with the current part marked "you're here".
   - **Next part:** "Next: {title} →", the most prominent link in the footer.
   - **Last part:** "That's the end of the series. Start from part 1, or see all series →".
2. **Tags:** plain links to `/tags/{tag}`.
3. **Related:**
   - Three list rows (date, title, pillar), using the Phase 3 rules.
   - **Fewer than 3 candidates:** shows what exists.
   - **None:** the section is omitted, not left empty.
4. **"Back to topic":** the pillar link at the top of the post, plus "More on {pillar} →" under the related list.
5. **RSS line** and the **author line**.

### 1.5 Sharing and social preview

- **Social card:** `/og/{slug}.png` (1200 × 630), generated at build time with Satori + resvg. Satori needs TTF/OTF/WOFF, not WOFF2, so the build needs a static TTF of Source Serif 4. Adobe publishes one; the exact file is confirmed in Phase 9.
  - **Layout:** `--paper` background; the pillar name in system font, `--muted`; the title in Source Serif 4 700, up to 3 lines at 64 px and stepping down to 52 px if longer; "prayashmishra.com" at the bottom left; a 6 px `--accent` rule at the top.
  - **Content:** no photo, no logo soup.
- **`featuredImage` in frontmatter:** used instead only if it is raster, keeping the existing `socialImage()` rule.
- **`og:image:alt`:** set to the post title, not the description.

### 1.6 Desktop vs mobile

| Element | ≥1280 | 1024–1279 | <1024 |
|---|---|---|---|
| ToC | Sticky left column | `<details>` above prose | `<details>` above prose |
| Side notes | Right column | Right column | End of section |
| Code / tables / figures | Can widen to 48rem | Prose width | Full width (bleed to the gutters), internal scroll |
| Header | Full, sticky | Full, sticky | Below 560 px: two rows (name + icons, then links) and not sticky. One row needs ~460 px, measured. |
| Post meta | One line | One line | Wraps; "Revised" goes on its own line |

### 1.7 Edge states

| Case | Behaviour |
|---|---|
| Fewer than 4 H2s | No ToC, at any size |
| No footnotes | Right column collapses; the prose is centred between the ToC and the empty right margin, still at 34em, so the text column doesn't jump between posts |
| Not in a series | No series line at the top, no navigator at the bottom |
| Series with a missing part (draft) | Unpublished parts are listed as plain text "(coming soon)", not links |
| No related posts | Section omitted |
| Very long code line / wide table | Internal scroll, page never scrolls sideways (checked at 360 px by the Phase 9 Playwright test) |
| `draft: true` | Only in dev; in dev the page shows a "Draft" line in `--accent` under the meta |
| Post updated many times | Only the latest `updatedDate` and summary are shown; history lives in git |
| JS disabled | Everything works except copy-to-clipboard and ToC active highlighting; the copy button is hidden by a `.no-js` class |

---

## 2. Home `/`

**Goal:** a hiring manager knows who you are and has opened one strong post within 60 seconds. A returning reader sees what's new without scrolling.

```
HEADER
Intro (single 40rem column)
  "Prayash Mishra"                         --text-display
  2–3 sentences in first person: what you do, what you write about,
  that the posts come from real work. Links: About · Projects · GitHub.
Start here
  3 rows: title + one line on why it's worth reading (written by you, not the description)
Recent
  5 rows: date · title · pillar        "All writing →"
Topics
  4 rows: pillar name · one-line description · post count
FOOTER
```

**Mobile:** identical order, single column. The intro and "Start here" fit above the fold on desktop, and the intro plus the first "Start here" row fit on mobile.

**Edge states:**
- **Fewer than 3 `startHere` posts:** the block shows what's set. With none, it's omitted and "Recent" moves up.
- **A pillar with 0 posts** (PostgreSQL today): listed with "Posts coming", not hidden. That's honest about direction, and the pillar page explains it.

---

## 3. Writing `/blog`

```
HEADER
H1 "Writing"   + one sentence, + "15 posts · RSS"
Topics: Messaging · PostgreSQL · Running services · Network edge   (links to pillar pages)
Series: Reliable messaging · NestJS on Dapr · ML request filter · Docker for Node
2026
  9 Sep  Idempotency in Distributed Systems …            Messaging
  9 Sep  The Transactional Outbox Pattern …              Messaging
  …
2025 (when it exists)
FOOTER
```

- **Ordering:** by **publish date** only. Revisions don't reorder the archive; the Phase 2 corrections pushed four old posts to the top, which is misleading. A small "revised" marker after the title (system 14 px `--muted`) shows that a post has been updated.
- **Series membership:** shown as a suffix on the row: "· Part 2 of 3".
- **Mobile:** each row stacks the date above the title, and the pillar moves under the title.
- **Edge states:**
  - **Year headings:** appear only when there's more than one year.
  - **Over ~60 posts:** gets year-level pages, per Phase 4 pagination.

---

## 4. Pillar `/topics/{pillar}`

- **H1:** the pillar name.
- **Introduction:** a short one, in your voice. **[TODO: 2–3 sentences per pillar from you, on why this area matters to you.]**
- **Series in this pillar:** a single line each.
- **All posts in the pillar:** list rows.
- **Related tags:** a footer line.
- **Edge state, 0 posts:** the intro plus "Nothing here yet. The posts that lean on PostgreSQL most are:" and the tagged posts (Outbox, Idempotency).

## 5. Tag `/tags/{tag}`

- **H1:** `#kafka`. **Count line:** "3 posts".
- **List:** list rows.
- **Pillar line:** "Part of: Messaging" when every post shares one pillar.
- **Edge state:** tags on fewer than 2 posts get no page. The Phase 3 vocabulary guarantees there are none, and the build enforces it.

## 6. Series `/series` and `/series/{id}`

- **Index:** each series is a title, a one-line description, and "3 parts · 32 min".
- **Series page:**
  - **Header:** the description.
  - **Parts:** an ordered list, each with its number, title, a one-line summary and reading time.
  - **Start button:** "Start with part 1 →".
- **Edge state:** an unpublished part is shown as "(coming soon)", not linked.

## 7. Projects `/projects`, `/projects/{slug}`

The layout is designed in Phase 8, together with the content model. The structure here:
- **Index:** one block per project: name, one-line problem, your role, stack, and one concrete outcome.
- **Project page:** follows the post page's reading layout, with an architecture figure near the top and a "Related writing" list at the end.
- **Edge state:** with one project, the index still exists. One well-documented project beats a grid of stubs.

## 8. About `/about`

Single prose column, same reading styles as a post, with a portrait optional (your call). Content structure is Phase 8. Contact links are at the end as plain text links, with no form.

## 9. 404

- **Heading:** "This page doesn't exist."
- **Explanation:** one sentence. If the URL starts with `/blog/`, it suggests checking the Writing page, because the slug may have been mistyped.
- **List:** the 5 most recent posts.
- **Nothing else:** no illustration, no joke.

## 10. Global behaviour

- **Theme toggle:**
  - **Control:** a three-state button: System → Light → Dark.
  - **Storage:** the choice is stored in `localStorage`, wrapped in try/catch.
  - **No flash:** an inline script sets `data-theme` before first paint.
  - **Accessible name:** the button's `aria-label` names the current state ("Theme: system").
- **Skip link:** goes to `<main>`. On post pages it goes to the first paragraph, skipping the ToC.
- **Print stylesheet:** posts print as clean single-column text. The header, footer, ToC and copy buttons are hidden; side notes are inlined as footnotes; link URLs are printed after external links. Long technical posts get printed and annotated, which suits a notebook design.
- **Link behaviour:** external links open in the same tab (no `target="_blank"`) and get a small `↗` after them in `--muted`.
