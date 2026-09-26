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

- **Astro & Tailwind:** Built using Astro v7 and Tailwind CSS v4 (configured via `@tailwindcss/vite` plugin in `astro.config.mjs`).
- **SEO helpers:** `src/lib/seo.ts` owns site constants, canonical URL construction, and `socialImage()`. Social previews (og:image / twitter:image / JSON-LD `image`) silently fail on SVG, so `socialImage()` falls back to `/images/default-og.png` for any non-raster `featuredImage`. Use it rather than `new URL(featuredImage, ...)` directly.
- **Content Schema:** Blog posts are defined in `src/content.config.ts` using the Astro Content Loader API. They load from markdown files in `src/content/blog/`. Media is uploaded to `public/images/uploads` and served from `/images/uploads`. When adding or editing blog content, ensure you match the schema rules:
  - Required frontmatter: `title`, `slug` (lowercase, numbers, hyphens), `description`, `publishDate` (as `YYYY-MM-DDTHH:mm:ssZ`), `author`, `tags` (array), and `draft` (boolean).
  - Optional frontmatter: `updatedDate`, `updateSummary` (concise changelog note explaining what was updated), `category` (enum: `engineering`, `design`, `tutorial`, `opinion`, `career`), `featured` (boolean — pins the post to the homepage "Featured Deep Dive" slot; without it the newest post is auto-featured), `featuredImage`, `featuredImageAlt`.
  - **`slug` is load-bearing.** The glob loader derives `entry.id` from the `slug` field, and `[...slug].astro` routes on `entry.id`. `src/data/series.ts` indexes posts by those slugs to render series banners and "Part N of M" badges. Renaming a post's `slug` without updating `series.ts` silently disables its series navigation with no build error.
  - **`featuredImage` must be a raster format** (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`). SVG is accepted by the schema but `socialImage()` will substitute the site default, because X, LinkedIn and Facebook do not render SVG link previews.
  - **Tags use a controlled vocabulary.** Prefer an existing tag over inventing a near-duplicate (e.g. `docker` not `containers`, `kubernetes` not `k9s`, `postgresql` not `database`). A tag used on only one post provides no navigational value — check `src/content/blog/*.md` before adding a new one.
  - **Cross-link related posts.** Posts that build one argument must link to each other in both directions; a snippet that another post contradicts should link to the correction.

## Blog Writing Style

All blog content must follow `docs/blog-writing-guide.md`. Core rules:
- Deep, first-principles analysis — not re-stated docs or listicles.
- Every post must include dedicated **edge cases**, **pitfalls** (with symptoms + causes + fixes), and **best practices with trade-offs**.
- Written in the voice of an experienced senior engineer: precise terminology, honest trade-offs, no marketing tone.
- Prefer rare/non-obvious technical depth over shallow coverage.
- **Never ship code you have not verified works.** Show real failure output (errors, stack traces). Flag version-sensitive claims, and cite the spec, RFC, or bug report you relied on. Publishing plausible-but-wrong config under a "production hardening" heading is worse than publishing nothing.
