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

**Display headlines.** Post titles written for search ("The Transactional Outbox Pattern: Why Your 100-Line…") are too long to set in capitals at 100px. So each post has an optional `headline` of up to 48 characters, used on the hero, the cards and the social card. `title` stays the `<title>` and the search title. The hero size also has a cap set by the longest word, so a long word like "Idempotency," is never split across lines.

## 2. Colour

The first magazine palette used four unrelated neons (#ff4f1a, #2f5bff, #00b874, #9f7aff) at full saturation next to pure black, and read as random. The palette now is one family: warm paper and a warm near-black, and four topic colours set at the same OKLCH lightness (0.66 to 0.68) and similar chroma (0.09 to 0.12), so they read like four inks from one press. Every topic fill takes ink text.

### Page

| Token | Light | Dark | Contrast on `--paper` / `--paper-2` |
|---|---|---|---|
| `--paper` | `#f4f0e7` | `#161311` | |
| `--paper-2` | `#e8e2d7` | `#201e1b` | |
| `--ink` | `#1b1814` | `#f4f0e7` | 15.6 / 13.7 (dark 16.3 / 14.6) |
| `--ink-2` | `#403c39` | `#c8c3bc` | 9.6 / 8.5 (dark 10.6 / 9.5) |
| `--muted` | `#67625c` | `#a9a49c` | 5.3 / 4.7 (dark 7.5 / 6.7) |

Rules are `--line`, the ink colour: 3px between page sections and 1px inside them.

### Pillars

Each topic has a fill colour (`--c`), a text colour for use on that fill (`--on`, always ink), and a text colour for use on the page (`--c-text`). A `pillar-<id>` class on any element sets all three, so components just use `var(--c)`.

| Pillar | `--c` fill | ink on fill | `--c-text` light (on paper / paper-2) | `--c-text` dark |
|---|---|---|---|---|
| Messaging | `#d77c60` clay | 5.8 | `#944126` (6.1 / 5.4) | `#ec997f` (8.3) |
| PostgreSQL | `#6198c6` slate blue | 5.7 | `#2c628d` (5.7 / 5.0) | `#85b7e2` (8.7) |
| Running services | `#64aa85` sage | 6.4 | `#256d4c` (5.5 / 4.8) | `#83c19f` (8.9) |
| Network edge | `#9b86c1` heather | 5.5 | `#665189` (6.0 / 5.2) | `#b9a6dd` (8.4) |

Rules that follow from the table:

- Text on any topic fill is ink. White on these fills is under 3:1.
- The fills are never used for text on the light page. That's what `--c-text` is for.
- To add a topic, keep its fill at OKLCH lightness about 0.67 and chroma 0.09 to 0.12, and pick a hue away from the other four.
- Callout labels follow the same pattern: slate blue for notes, sage for tips, ochre (`#dcae5a`, 8.6) for cautions and clay for warnings, all with ink text.

### Night panels

The header, footer, code blocks, scroll diagrams and the "work behind it" strip are dark in both themes: `#1b1814` and `#161311` (`#0e0c0b` in dark mode), with text `#e8e4dd` / `#f4f0e7` (14.6 / 15.6) and muted `#a9a49c` (7.5). In the diagrams, a failure is clay (`#e58870`) and a success is sage (`#86d1a8`), each a step lighter than its fill so it holds on the dark panel.

### Code

Code is always on the dark "press" panel (`#1b1815`), with one Shiki theme (`src/lib/markdown/shiki-themes.ts`):

| Token | Colour | Contrast (on a highlighted line) |
|---|---|---|
| Text | `#e8e4dd` | 13.9 (11.8) |
| Comment | `#958f86` | 5.5 (4.7) |
| Keyword | `#eea285` | 8.5 (7.2) |
| String | `#9bd4ae` | 10.5 (8.9) |
| Number | `#e6c686` | 10.8 (9.1) |
| Function | `#95c0e5` | 9.2 (7.8) |
| Type | `#c1b1e1` | 9.0 (7.6) |

Highlighted lines get a `#2e2520` tint plus a 4px bar in the pillar colour, so the meaning doesn't rest on the tint alone.

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

- **Delayed starts:** an animation that starts late uses a negative `begin`, so it is already mid-cycle on load instead of parked at the SVG origin.
- **Kinds of motion:** covers and diagrams use SMIL; titles rise, blocks reveal on scroll, and the home ticker uses CSS animation.
- **Motion switch:** the header has a pause/play control, which defaults to off under `prefers-reduced-motion` and is remembered per browser. With motion off:
  - CSS animations are paused;
  - rising titles and revealed blocks appear in place;
  - every `svg[data-anim]` is paused.
- **Off screen:** covers and diagrams are also paused when they're off screen, so a page of fifteen covers doesn't animate fifteen things at once.
- **Diagram state changes:** these are 0.4s fades, and they still happen with motion off, because they carry meaning. Only the decorative movement stops.
