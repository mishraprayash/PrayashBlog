# Phase 4: Design system (magazine edition)

The first design system (a quiet serif "notebook") was built, then replaced after review: it read as the same blog every backend engineer has. This is the system now in the code: a bold editorial magazine with a systems feel, one colour per topic, and animated cover art and diagrams for every post. Prototype: `12-magazine.html`.

## 1. Typography

| Role | Family | Where |
|---|---|---|
| Display | Archivo (variable, width 62–125%, weight 100–900) | Mastheads, post titles, section heads, cards. Mostly 800–900, often expanded (`font-stretch: 112–125%`) and in capitals. |
| Body | Newsreader (variable weight, roman + italic) | Post text, ledes, descriptions. 19px / 1.7. |
| Mono | IBM Plex Mono 400 / 500 / 600 | Labels, meta, chips, code, diagram text. Usually 11–13px, uppercase, tracked +0.05em. |

All three are self-hosted through fontsource. Archivo (latin, width+weight) and Newsreader (latin, roman) are preloaded. The social cards use static Archivo 900 and Plex Mono 500 WOFF, since Satori reads neither WOFF2 nor variable fonts.

**Titles rise into place one word at a time** (`Rise.astro`). The full title sits in a visually hidden span for assistive tech, and the animated words are `aria-hidden`.

**Display headlines.** Post titles written for search ("The Transactional Outbox Pattern: Why Your 100-Line…") are too long to set in capitals at 100px. So each post has an optional `headline` of up to 48 characters, used on the hero, the cards and the social card. `title` stays the `<title>` and the search title.

## 2. Colour

### Page

| Token | Light | Dark | Contrast on page |
|---|---|---|---|
| `--paper` | `#f1eee6` | `#0f0f11` | |
| `--paper-2` | `#e7e3d8` | `#1a1a1d` | |
| `--ink` | `#111111` | `#f1eee6` | 16.3 / 16.5 |
| `--ink-2` | `#3a3a38` | `#c8c5bd` | 9.8 / 11.1 |
| `--muted` | `#5f5d58` | `#a6a39b` | 5.7 (5.1 on `--paper-2`) / 7.6 |

Rules are `--line`, the ink colour: 3px between page sections and 1px inside them.

### Pillars

Each topic has a fill colour (`--c`), a text colour for use on that fill (`--on`), and a text colour for use on the page (`--c-text`). A `pillar-<id>` class on any element sets all three, so components just use `var(--c)`.

| Pillar | `--c` fill | `--on` (contrast) | `--c-text` light (on paper / paper-2) | `--c-text` dark |
|---|---|---|---|---|
| Messaging | `#ff4f1a` | `#111111` (5.7) | `#b33a10` (5.1 / 4.6) | `#ff4f1a` (5.8) |
| PostgreSQL | `#2f5bff` | `#ffffff` (5.2) | `#2a50e8` (5.3 / 4.8) | `#6f8dff` (6.3) |
| Running services | `#00b874` | `#111111` (7.3) | `#006b47` (5.1 on paper-2) | `#00b874` (7.4) |
| Network edge | `#9f7aff` | `#111111` (6.0) | `#6d3fd8` (5.4 / 4.9) | `#a98bff` (7.1) |

Rules that follow from the table:

- White text on the orange fill is only 3.3:1, so text on Messaging and Running services fills is always ink.
- The bright fills are never used for text on the light page. That's what `--c-text` is for.
- Callout labels follow the same pattern: blue fill with white text for notes, green, amber (`#ffb000`) and orange fills with ink text for tips, cautions and warnings.

### Night panels

The header, footer, code blocks, scroll diagrams and the "work behind it" strip are dark in both themes: `#111111` and `#0f0f11`, with text `#e8e6df` / `#f1eee6` (≥15:1) and muted `#a6a39b` (7.5).

### Code

Code is always on the dark "press" panel (`#141416`), with one Shiki theme (`src/lib/markdown/shiki-themes.ts`):

| Token | Colour | Contrast |
|---|---|---|
| Text | `#e8e6df` | 14.7 |
| Comment | `#8f8c85` | 5.5 (4.8 on a highlighted line) |
| Keyword | `#ff8a5c` | 7.9 |
| String | `#8ee0a8` | 11.7 |
| Number | `#ffc66d` | 11.9 |
| Function | `#8fb0ff` | 8.6 |
| Type | `#c9a7eb` | 9.0 |

Highlighted lines get a `#26201c` tint plus a 4px bar in the pillar colour, so the meaning doesn't rest on the tint alone.

## 3. Layout

- **Gutter:** 16px, rising to 24px at 640px and 32px at 1280px. The black bar is 52px tall and sticky. Below 560px its links take a second row and it stops being sticky.
- **Home:**
  - masthead ("Systems, broken down.", up to 13rem);
  - the lead story in its pillar colour with its cover;
  - an "issue" grid: a 12-column grid using 7+5, 4+4+4 and 5+7 spans, falling to two columns, then one;
  - the projects strip;
  - one band per pillar.
- **Post:**
  - **Hero:** a full-height block in the pillar colour, with the title and meta on the left and the cover on the right; stacked below 900px.
  - **Body:** a centred 42rem column. From 1280px, the contents rail sits in the left column.
  - **Wider blocks:** code, tables and labs grow to 52rem; scroll diagrams grow to 70rem. When the rail is shown, code and tables grow to the right only.
- **Lists:** card grids for posts, numbered rows for bands, series and related lists.

## 4. Components

- **Cover** (`src/lib/covers.ts`): a 400×260 SVG drawn for the post's subject. The background and grid run well past the viewBox, so `meet` scaling into a box of any shape leaves no empty bands. Covers are decorative (`aria-hidden`). A post chooses one with `cover:`; without one it gets a plain pillar cover.
- **Story** (`rehype-story.ts`, `src/lib/diagrams/`, `scripts/story.ts`): numbered steps on the left and a sticky diagram on the right.
  - The step closest to the middle of the screen is current, and the diagram switches its `data-show` / `data-hl` parts to match.
  - Without JS, every step is shown in full and the diagram stays in its first state.
  - Below 900px the diagram sticks to the top half of the screen.
- **Lab** (`labs.ts`, `scripts/labs.ts`): an interactive reproduction, such as the outbox ghost row. Its buttons use `aria-pressed`, and its narration is a polite live region. Without JS only the intro sentence shows.
- **Code block:** a dark panel with a 3px border and an 8px offset shadow in the pillar colour, a bar with the filename or language, and Copy.
- **Callout:** a paper-2 box with an 8px left border, and a label chip on the callout's fill colour.
- **Chips:** 1.5px outlined mono labels for topics, tags and series parts.

## 5. Motion

- **Kinds of motion:** covers and diagrams use SMIL; titles rise, blocks reveal on scroll, and the home ticker uses CSS animation.
- **Motion switch:** the header has a pause/play control, which defaults to off under `prefers-reduced-motion` and is remembered per browser. With motion off:
  - CSS animations are paused;
  - rising titles and revealed blocks appear in place;
  - every `svg[data-anim]` is paused.
- **Off screen:** covers and diagrams are also paused when they're off screen, so a page of fifteen covers doesn't animate fifteen things at once.
- **Diagram state changes:** these are 0.4s fades, and they still happen with motion off, because they carry meaning. Only the decorative movement stops.
