# Prayash Mishra: blog

Source for [prayashmishra.com](https://prayashmishra.com): writing on how backend systems fail where they meet databases, message brokers and the network, and what fixes them.

## Stack

- **Astro 7**, static output, with the unified Markdown pipeline (`@astrojs/markdown-remark`) for the custom plugins in `src/lib/markdown/`
- **Plain CSS on design tokens:** `src/styles/tokens.css`, `prose.css`, `pages.css`, `print.css`. Values and contrast ratios are in `docs/redesign/04-design-system.md`.
- **Self-hosted fonts:** Archivo, Newsreader and IBM Plex Mono, via fontsource
- **Covers and diagrams:** an animated SVG cover per post (`src/lib/covers.ts`) and scroll-driven diagrams built into the posts at build time (`src/lib/diagrams/`); no client framework
- **Build-time output:** syntax highlighting with a custom light/dark Shiki theme pair, social cards (Satori + resvg), RSS and sitemap
- **Hosting:** Vercel (`vercel.json` holds headers and redirects for old URLs)

## Commands

| Command | What it does |
| :--- | :--- |
| `npm run dev` | Dev server with drafts visible |
| `npm run build` | Production build into `dist/`, including content checks |
| `npm run preview` | Serve the build locally |
| `npm run check` | Astro and TypeScript checks |
| `npm run test:pages` | Every built page at 360px and 1440px, light and dark: sideways scroll, JS errors, one `<h1>`, axe. Needs Chromium (set `CHROMIUM_PATH` if Playwright doesn't manage one). |
| `npm run todos` | Lists `[TODO: …]` placeholders still in the content |
| `node scripts/preview-diagram.mjs src/lib/diagrams/<id>.ts out/` | Renders one scroll diagram at every step, without a build |

## Writing a post

Start from `docs/post-template.md` and follow `docs/blog-writing-guide.md`. Posts live in `src/content/blog/`; the schema is in `src/content.config.ts` and summarised in `AGENTS.md`. The short version:

```yaml
---
title: "Say what breaks and where"
slug: "lowercase-with-hyphens"   # the URL; never change it once published
description: "Up to 160 characters."
publishDate: "2026-11-01T09:00:00Z"
author: "Prayash Mishra"
headline: "Short display title"   # optional, ≤48 characters
pillar: "messaging"              # messaging | postgresql | running-services | network-edge
cover: "outbox"                  # optional, from src/lib/covers.ts
tags: ["postgresql"]             # from src/data/taxonomy.ts, max 4
series: "reliable-messaging"     # optional, with seriesPart
seriesPart: 4
draft: true
---
```

The build fails on an unknown tag, a series with a gap or a duplicate part, or a `related` slug that doesn't exist. After changing a Markdown plugin, clear the content cache: `rm -rf .astro node_modules/.astro`.

## Redesign notes

The October 2026 redesign is documented phase by phase in `docs/redesign/`, from the audit (`01`) to the final review and the checklist of things left to do (`10`).
