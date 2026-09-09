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
```

## Architecture & Conventions

- **Astro & Tailwind:** Built using Astro v7 and Tailwind CSS v4 (configured via `@tailwindcss/vite` plugin in `astro.config.mjs`).
- **Content Schema:** Blog posts are defined in `src/content.config.ts` using the Astro Content Loader API. They load from markdown files in `src/content/blog/`. Media is uploaded to `public/images/uploads` and served from `/images/uploads`. When adding or editing blog content, ensure you match the schema rules:
  - Required frontmatter: `title`, `slug` (lowercase, numbers, hyphens), `description`, `publishDate` (as `YYYY-MM-DDTHH:mm:ssZ`), `author`, `tags` (array), `featuredImage` (path starting with `/images/uploads/`), `featuredImageAlt`, and `draft` (boolean).
  - Optional frontmatter: `updatedDate`, `updateSummary` (concise changelog note explaining what was updated), `category` (enum: `engineering`, `design`, `tutorial`, `opinion`, `career`).

## Blog Writing Style

All blog content must follow `docs/blog-writing-guide.md`. Core rules:
- Deep, first-principles analysis — not re-stated docs or listicles.
- Every post must include dedicated **edge cases**, **pitfalls** (with symptoms + causes + fixes), and **best practices with trade-offs**.
- Written in the voice of an experienced senior engineer: precise terminology, honest trade-offs, no marketing tone.
- Prefer rare/non-obvious technical depth over shallow coverage.
