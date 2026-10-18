## Development & Server Management

Start the dev server in the background:
```bash
astro dev --background
```
Manage the background server with:
- `astro dev stop`
- `astro dev status`
- `astro dev logs`

To verify TypeScript and frontmatter schema correctness:
```bash
npm run build
npx astro check
```

## Architecture & Conventions

- **Astro & styling:** Astro v7 with the unified Markdown pipeline (`@astrojs/markdown-remark`, needed for the custom rehype plugins in `src/lib/markdown/`). Styling is plain CSS on design tokens (`src/styles/tokens.css`, `prose.css`, `pages.css`); values and their contrast ratios are documented in `docs/redesign/04-design-system.md`.
- **SEO helpers:** `src/lib/seo.ts` owns site constants, canonical URL construction, and `socialImage()`. Social previews (og:image / twitter:image / JSON-LD `image`) silently fail on SVG, so `socialImage()` falls back to `/images/default-og.png` for any non-raster `featuredImage`. Use it rather than `new URL(featuredImage, ...)` directly.
- **Content Schema:** Blog posts are defined in `src/content.config.ts` using the Astro Content Loader API. They load from markdown files in `src/content/blog/`. Media is uploaded to `public/images/uploads` and served from `/images/uploads`. When adding or editing blog content, ensure you match the schema rules:
  - Required frontmatter: `title`, `slug` (lowercase, numbers, hyphens), `description`, `publishDate` (as `YYYY-MM-DDTHH:mm:ssZ`), `author`, `pillar` (one of `messaging`, `postgresql`, `running-services`, `network-edge`, defined in `src/data/taxonomy.ts`), and `draft` (boolean).
  - Optional frontmatter: `tags` (max 4, from the vocabulary in `src/data/taxonomy.ts`), `series` + `seriesPart` (always together; series ids are in `src/data/series.ts`), `startHere` (1–3, homepage "Start here" order), `related` (up to 3 slugs shown first under "Related"), `updatedDate`, `updateSummary` (reader-facing: shown on the post and in the feed, so write it for readers, not as a changelog), `featuredImage`, `featuredImageAlt`.
  - **`slug` is the URL.** The glob loader derives `entry.id` from it and `[...slug].astro` routes on that. Never change a published slug. Series membership lives in each post's own frontmatter, and `src/lib/posts.ts` fails the build on a series gap, a duplicate part, a duplicate `startHere`, or a `related` slug that doesn't exist.
  - **`featuredImage` must be a raster format** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`). SVG is accepted by the schema but `socialImage()` will substitute the site default, because X, LinkedIn and Facebook do not render SVG link previews.
  - **Tags are a closed vocabulary**, enforced by the schema: an unknown tag fails the build, and so does a vocabulary tag used on fewer than two posts. Add a tag to `TAGS` only when a second post will use it, and prefer an existing one (`docker` not `containers`, `postgresql` not `database`).
  - **Code fences:** `title="file.ts"` shows a filename bar; `{3-5}` highlights lines; `diff` as the language colours `+`/`-` lines; `console` or `output` labels a block as program output. Callouts use GitHub syntax: `> [!NOTE]`, `> [!TIP]`, `> [!CAUTION]`, `> [!WARNING]`.
  - **Cross-link related posts.** Posts that build one argument must link to each other in both directions; a snippet that another post contradicts should link to the correction.

## Blog Writing Style

All blog content must follow `docs/blog-writing-guide.md`. Core rules:
- Deep, first-principles analysis — not re-stated docs or listicles.
- Every post must include dedicated **edge cases**, **pitfalls** (with symptoms + causes + fixes), and **best practices with trade-offs**.
- Written in the voice of an experienced senior engineer: precise terminology, honest trade-offs, no marketing tone.
- Prefer rare/non-obvious technical depth over shallow coverage.
- **Never ship code you have not verified works.** Show real failure output (errors, stack traces). Flag version-sensitive claims, and cite the spec, RFC, or bug report you relied on. Publishing plausible-but-wrong config under a "production hardening" heading is worse than publishing nothing.
