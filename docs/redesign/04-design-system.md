# Phase 4: Design system

_Direction A, "Engineering notebook", approved in Phase 2. Every colour pair below was computed with the WCAG 2.x relative-luminance formula. Ratios are rounded down to two decimals._

---

## 1. Typography

### Families

| Role | Family | Source | Fallback stack |
|---|---|---|---|
| Body, headings | **Source Serif 4** (variable, `wght` 400–700, roman + italic) | `@fontsource-variable/source-serif-4` 5.3.1, latin subset, self-hosted | `"Source Serif 4", "Source Serif Fallback", Georgia, "Times New Roman", serif` |
| UI text (nav, dates, meta, captions, side notes, buttons) | **System UI** (no download) | — | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` |
| Code | **JetBrains Mono** (variable, `wght` 400–600) | `@fontsource-variable/jetbrains-mono` 5.3.0, latin subset, self-hosted | `"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` |

**Loading:**
- **Preload:** only `source-serif-4-latin-wght-normal.woff2` (50.9 KB). Italic (51.6 KB) and mono load on first use.
- **`font-display: swap`** on all three.
- **`"Source Serif Fallback"`:** a local `@font-face` over Georgia with `size-adjust` / `ascent-override` / `descent-override` computed from `@capsizecss/metrics` in Phase 6, so the swap doesn't shift layout.
- **Optical size axis:** not used. The `opsz` file is 122 KB, and the weight axis alone looks right at these sizes.
- **Google Fonts:** removed. That drops two third-party origins and the render-blocking CSS request.

### Type scale

Root is 16 px. The body size steps up once at `md`. Headings use a 1.25 ratio from the desktop body size.

| Token | Use | Size (mobile → ≥768 px) | Line height | Weight | Family |
|---|---|---|---|---|---|
| `--text-display` | Post title, page H1 | `clamp(2rem, 1.35rem + 2.6vw, 2.75rem)` (32 → 44 px) | 1.12 | 700 | Serif |
| `--text-h2` | Post H2 | 1.5rem → 1.75rem (24 → 28 px) | 1.25 | 650 | Serif |
| `--text-h3` | Post H3 | 1.25rem → 1.375rem (20 → 22 px) | 1.3 | 600 | Serif |
| `--text-h4` | Post H4 (rare) | 1.125rem → 1.1875rem | 1.4 | 600 | Serif |
| `--text-dek` | Post subtitle / description | 1.1875rem → 1.3125rem (19 → 21 px) | 1.45 | 400 italic | Serif |
| `--text-body` | Prose | 1.125rem → 1.1875rem (18 → 19 px) | 1.65 | 400 | Serif |
| `--text-code` | Code blocks | 0.875rem → 0.9375rem (14 → 15 px) | 1.6 | 400 | Mono |
| `--text-code-inline` | Inline code | 0.84em of surrounding text | inherit | 400 | Mono |
| `--text-ui` | Nav, meta, buttons, list dates | 0.9375rem (15 px) | 1.4 | 400 / 600 | System |
| `--text-small` | Captions, side notes, footnotes, table cells | 0.875rem (14 px) | 1.5 | 400 | System (tables: serif 0.9375rem) |
| `--text-tiny` | Never below this | 0.8125rem (13 px) | 1.4 | 500 | System |

**Rules:**
- No text below 13 px anywhere. The current site uses 10–11 px mono labels.
- No uppercase letter-spaced mono labels. Section labels are sentence-case, system UI, 15 px, weight 600.
- Old-style numerals in prose (`font-variant-numeric: oldstyle-nums`); lining, tabular numerals in tables, dates and code (`lining-nums tabular-nums`).
- `text-wrap: pretty` on paragraphs, `balance` on headings.
- Heading spacing: H2 has 2.5em above and 0.6em below; H3 has 1.8em above and 0.5em below. Headings take `scroll-margin-top: 5rem` for anchor jumps under the sticky header.

### Reading measure

- **Prose column:** `max-width: 34em` at body size. That is 646 px at 19 px and 612 px at 18 px. Measured in Chromium with Source Serif 4 on a paragraph from the Message Queues post, it averages **65.6 characters per line** (range 58–73) at both sizes.
- **Code blocks, tables and figures** may break out to `min(100%, 48rem)` on wide screens, never wider. They scroll horizontally inside their own container, and the page itself never scrolls sideways.

---

## 2. Color

Tokens are CSS custom properties on `:root`, swapped by `[data-theme="dark"]`. Following the system setting is the default until the reader picks a theme. The Tailwind `paper-*`, `zinc-*`, `brand-*` and `ember-*` ramps are replaced; there is no ramp, only these named roles.

### Light

| Token | Value | Role | Contrast |
|---|---|---|---|
| `--paper` | `#FAF8F4` | Page background | — |
| `--raised` | `#F3EFE7` | Code blocks, callouts, table header | — |
| `--rule` | `#E2DCD0` | Hairlines, dividers (decorative only) | 1.29 vs paper |
| `--rule-strong` | `#8F8678` | Input borders, button outlines, focusable boundaries | **3.38** vs paper (≥3 for UI) |
| `--ink` | `#1D1B18` | Body text, headings | **16.20** paper · 14.98 raised |
| `--ink-2` | `#45403A` | Secondary text, dek | **9.67** paper · 8.94 raised |
| `--muted` | `#6A6359` | Dates, meta, captions, side notes | **5.59** paper · 5.17 raised |
| `--accent` | `#A3261B` | Links, active ToC item, focus ring, "warning" callout | **6.95** paper · 6.42 raised |
| `--accent-hover` | `#7E1C13` | Link hover | **9.60** paper |
| `--note` | `#2F5B8A` | "Note" callout marker | **6.63** paper · 6.14 raised |
| `--tip` | `#2E6A3A` | "Tip" callout marker | **6.11** paper · 5.65 raised |
| `--caution` | `#855600` | "Caution" callout marker, numbers in code | **5.95** paper · 5.50 raised |
| `--selection` | `#F1D6D0` | `::selection` background | ink on it: 12.49 |
| `--line-hl` | `#EAE2D3` | Highlighted code line background | ink on it: 13.35, muted: 4.61 |

### Dark

Warm charcoal, matching the paper rather than a cool blue-black.

| Token | Value | Contrast |
|---|---|---|
| `--paper` | `#171513` | — |
| `--raised` | `#211E1B` | — |
| `--rule` | `#302C27` | 1.31 (decorative) |
| `--rule-strong` | `#7A7268` | **3.85** vs paper |
| `--ink` | `#ECE7DE` | **14.79** paper · 13.47 raised |
| `--ink-2` | `#CFC8BC` | **10.96** paper · 9.98 raised |
| `--muted` | `#A69E91` | **6.87** paper · 6.26 raised |
| `--accent` | `#F08A73` | **7.45** paper · 6.78 raised |
| `--accent-hover` | `#F6AB98` | **9.71** paper |
| `--note` | `#8DB6E3` | **8.61** paper |
| `--tip` | `#8CC79A` | **9.32** paper |
| `--caution` | `#E2B65E` | **9.61** paper |
| `--selection` | `#5A2A22` | ink on it: 9.53 |
| `--line-hl` | `#2B2723` | ink on it: 12.03, muted: 5.59 |

### Rules that come out of the numbers

- **Links are always underlined.** The accent is only 2.33:1 (light) and 1.99:1 (dark) against body text, so colour alone can't mark a link (WCAG 1.4.1). Use `text-decoration-thickness: 1px; text-underline-offset: 0.18em`, thickening to 2px on hover.
- **Highlighted code lines get a 3 px `--accent` bar in the gutter.** The tint alone is 1.12:1 against `--raised`, too faint to rely on.
- **`--rule` is never the only boundary of something interactive.** Inputs and buttons use `--rule-strong`.
- **One accent.** `--note` / `--tip` / `--caution` appear only as the marker and label of their callout, never as decoration elsewhere.

### Code highlighting: a custom theme pair

I tested 21 bundled Shiki themes against `--raised`. All 11 light candidates fail, each with 3–18 token colours under 4.5:1. Two dark themes pass (`everforest-dark`, `catppuccin-mocha`), but neither matches the warm palette, and the light and dark themes should be one pair. So the site ships its own two small themes, `notebook-light` and `notebook-dark`, defined in `src/styles/shiki/`, with these token colours:

| Scope | Light (on `#F3EFE7`) | Dark (on `#211E1B`) |
|---|---|---|
| Default text, variables, properties | `#1D1B18` · 14.98 | `#ECE7DE` · 13.47 |
| Comments (italic) | `#6A6359` · 5.17 | `#A69E91` · 6.26 |
| Keywords, storage, operators-as-words | `#A3261B` · 6.42 | `#F08A73` · 6.78 |
| Strings, regex | `#2E6A3A` · 5.65 | `#8CC79A` · 8.49 |
| Numbers, constants, booleans | `#855600` · 5.50 | `#E2B65E` · 8.76 |
| Functions, methods | `#2F5B8A` · 6.14 | `#8DB6E3` · 7.84 |
| Types, classes, tags | `#6A3D8F` · 6.84 | `#C9A7EB` · 8.06 |
| Punctuation | `#45403A` · 8.94 | `#CFC8BC` · 9.98 |
| Diff `+` line background | `rgb(46 106 58 / .12)` | `rgb(140 199 154 / .12)` |
| Diff `-` line background | `rgb(163 38 27 / .10)` | `rgb(240 138 115 / .12)` |

The themes reuse the page's own colours, so code reads as part of the page rather than as a block pasted from an editor.

---

## 3. Spacing, layout, breakpoints

**Spacing scale** (4 px base), as `--space-*`:

| Token | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Value | 4 px | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96 |

Prose rhythm is in `em` instead: paragraphs are separated by `1em`, and lists, code and figures by `1.4em`.

**Breakpoints:**

| Name | Min width | What changes |
|---|---|---|
| base | 0 | Single column, 16 px side gutter |
| `sm` | 640 px | Gutter 24 px |
| `md` | 768 px | Body text 18 → 19 px; headings step up |
| `lg` | 1024 px | Post gets the right **notes column**; ToC still collapsed at the top |
| `xl` | 1280 px | Post gets the left **ToC column** too |

**Page shell:** `max-width: 72rem` (1152 px) centred, side gutter `16 / 24 / 32 px` at base / sm / lg.

**Post grid:**

```
≥1280   [ ToC 13rem ] [ gap 3rem ] [ prose 34em ] [ gap 3rem ] [ notes 13rem ]
1024–   [ prose 34em ] [ gap 3rem ] [ notes 14rem ]           (ToC = disclosure above the prose)
<1024   [ prose 100% ]                                         (side notes become numbered notes at the end of the section)
```

The other pages (Home, Writing, topics, About) use a single 40rem column. Their content is lists and prose, so they don't need a grid.

---

## 4. Components

All components use the tokens above. No component has a shadow, a gradient or `backdrop-filter`.

**Header.**
- **Layout:** 56 px tall, `--paper` background with a `--rule` bottom border, sticky. Name on the left (serif 600, 17 px). On the right, Writing · Projects · About (system 15 px, `--ink-2`), an RSS icon link, and the theme toggle.
- **Current section:** `--ink` with a 2 px `--accent` underline.
- **Touch targets:** at least 44 × 44 px. The whole header fits at 360 px with no wrapping.
- **Removed:** the backdrop blur and the reading-progress bar.

**Footer.**
- **Content:** one row, `--muted` 14 px: © year · RSS · GitHub · LinkedIn · "Source on GitHub" (links to the repo).
- **Spacing:** `--rule` top border, 48 px padding.

**Post list item** (replaces cards).
- **Format:** a plain row. Date (system 14 px tabular, `--muted`, fixed 6.5rem column) | title (serif 19 px, `--ink`, underline on hover) | pillar (system 14 px `--muted`), with reading time on the right at ≥ md.
- **Mobile:** the date stacks above the title.
- **Hover:** no hover lift, no border. The whole row is the link target, and only the title underlines.

**Tag link.**
- **Style:** inline text, not a pill: `#kafka` in system 14 px, `--muted`, underlined on hover. Separated by middots.
- **Size:** the target is padded to 32 px tall.

**Callouts** (note, tip, caution, warning).
- **Shape:** a 3 px left border in the role colour, `--raised` background, 14–16 px padding, and a label in system 14 px 600 in the role colour ("Note", "Tip", "Caution", "Warning"). Warning uses `--accent`.
- **Text:** body serif at 0.95em.
- **Authoring:** GitHub-style `> [!NOTE]` syntax in markdown, rendered by a small remark plugin, so posts stay portable.
- **Rule:** at most two per section; a callout isn't a substitute for a paragraph.

**Code blocks.**
- **Box:** `--raised` background, 1 px `--rule` border, 4 px radius, padding 14 px 16 px. Text is `--text-code`, never wrapped, scrolling inside its own box.
- **Title bar (optional, from the code fence meta):** filename in system 13 px `--muted` on the left, language in the same style on the right, and a copy button that's always visible at 14 px with a "Copied" text state (not just an icon swap) and an `aria-live` announcement.
- **Line highlight:** `{3-5}` in the fence meta gives a `--line-hl` background plus the 3 px `--accent` gutter bar.
- **Diff:** `diff` language, with `+`/`-` backgrounds from the theme table.
- **Line numbers:** off by default; `showLineNumbers` in the meta turns them on, in `--muted`, not selectable.
- **Implementation:** Expressive Code was considered. Shiki transformers (`@shikijs/transformers`) plus a ~40-line rehype plugin keep the JS at zero, and the copy button is the only script.

**Inline code.**
- **Style:** mono 0.84em, `--ink`, `--raised` background, 1 px `--rule` border, radius 3 px, padding 0.1em 0.3em, `box-decoration-break: clone` when it wraps.
- **Inside links:** inherits the link colour and underline.

**Tables.**
- **Text:** serif 0.9375rem with tabular numerals. Header row in system 14 px 600 on `--raised`.
- **Lines:** 1 px `--rule` row separators, no vertical rules, cell padding 8 px 12 px, first column left-aligned, numeric columns right-aligned.
- **Overflow:** always wrapped in a scroll container (`overflow-x: auto`, `tabindex="0"`, labelled by the table caption) so a wide table can't widen the page.

**Blockquote** (quotations only, not callouts).
- **Style:** a 2 px `--rule-strong` left border, 1.25em left padding, italic `--ink-2`. The source goes on a following line in system 14 px `--muted`, prefixed with "—".

**Figures and images.**
- **Markup:** `<figure>` with `<figcaption>` in system 14 px `--muted`, auto-numbered per post ("Fig. 2 — …").
- **Images:** go through `astro:assets` (`<Image>`) for width/height (no CLS), AVIF/WebP and lazy loading. Alt text is required by the schema for frontmatter images and by a lint rule for markdown images.

**Diagrams.**
- **Default:** hand-drawn inline SVG using `currentColor` and the CSS tokens, so they theme correctly. Authored as `.svg` files next to the post and inlined at build time.
- **Mermaid:** rendered **at build time** to SVG (`rehype-mermaid` with Playwright, already on the build machine), never in the browser.
- **ASCII box diagrams:** converted to one of the above during the Phase 7 rewrites. They don't scale on mobile and screen readers announce them as gibberish. Where one stays, it gets `role="img"` and an `aria-label` describing it.

**Side notes and footnotes.**
- **Authoring:** standard markdown footnotes (`[^1]`).
- **≥1024 px:** they render as side notes in the notes column, aligned to their reference: system 14 px `--muted`, with a superscript number in `--accent`.
- **Below 1024 px:** they render as footnotes at the end of the section, with a back-link.
- **Implementation:** pure CSS plus a rehype plugin; no JS.

**Table of contents.**
- **Content:** H2 and H3 only. Shown only when a post has 4 or more H2s.
- **≥1280 px:** sticky in the left column, system 14 px `--muted`, with the active item in `--ink` and a 2 px `--accent` left bar.
- **Below that:** a `<details>` disclosure labelled "Contents" above the first paragraph.
- **Active item:** tracked by IntersectionObserver, the only post-page script besides copy.

**Series navigator.**
- **Top of post:** one line, "Part 2 of 3 in *Reliable messaging, end to end*", linking to the series page.
- **Bottom of post:** a short ordered list of all parts, current one in `--ink` 600 marked "you're here", others as links, then "Next: {title} →" in larger serif.
- **Not:** a coloured banner.

**RSS / newsletter prompt.**
- **Placement and copy:** one paragraph at the end of every post, in system 15 px `--ink-2`: "New posts go out by RSS ([feed](/rss.xml)). No newsletter yet."
- **Newsletter:** an email form only if you decide to run one. A newsletter is a commitment, so it stays out until then.

**Revision note.**
- **Placement:** a single line under the post meta, "Revised 18 Oct 2026", where the date links to an expandable `<details>` with the `updateSummary`.
- **Replaces:** the emerald "Article Revised" box.

**Pagination.**
- **Not needed under ~60 posts.** The Writing page groups everything by year.
- **When needed:** plain "← Newer · Older →" text links, system 15 px, with `rel="prev"`/`rel="next"`.

**Focus states.**
- **Ring:** `outline: 2px solid var(--accent); outline-offset: 3px` on every focusable element, using `:focus-visible`. The accent is 6.95:1 against paper in light and 7.45:1 in dark.
- **Skip link:** kept, restyled as an `--ink` on `--paper` box with a `--rule-strong` border.

---

## 5. Motion

- **Allowed:** colour and underline-thickness transitions on links and buttons (120 ms ease-out); the ToC active-item change (120 ms); `<details>` opening with no animation (native).
- **Removed:** card hover lifts, `animate-pulse` dots, the reading progress bar, background gradients and textures, and smooth scrolling as a default.
- **`prefers-reduced-motion: reduce`:** all transitions drop to 0 ms. There's no animation to disable beyond that, and that's deliberate.
- **Theme switching:** instant, no cross-fade.
