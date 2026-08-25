# Prayash Mishra — Blog

Personal blog built with [Astro](https://astro.build) + Tailwind CSS v4. In-depth analyses of backend systems, cloud-native microservices, containerization, and distributed reliability — featuring edge cases, real-world pitfalls, and production best practices.

## Stack

- **Astro v7** — static site generation, content collections, fast builds
- **Tailwind CSS v4** — modern styling via `@tailwindcss/vite`
- **Markdown & Frontmatter** — Git-native content management via `src/content/blog/`
- **RSS + Sitemap** — auto-generated at `/rss.xml` and `/sitemap-index.xml`

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:4321` in your browser.

## Available Commands

| Command           | Action                                        |
| :---------------- | :-------------------------------------------- |
| `npm run dev`     | Start local development server with hot reload |
| `npm run build`   | Build production static site to `./dist/`      |
| `npm run preview` | Preview production build locally               |
| `npm run check`   | Run Astro + TypeScript type checks            |

## Writing & Managing Posts

All blog posts live in `src/content/blog/` as Markdown files adhering to the schema in `src/content.config.ts`:

```yaml
---
title: "Post Title"
slug: "post-slug"
description: "One or two sentence summary shown in cards, search, and meta tags."
publishDate: "2026-08-24T10:00:00Z"
updatedDate: "2026-08-25T10:00:00Z"   # optional
author: "Prayash Mishra"
tags: ["nestjs", "dapr", "architecture"]
category: "engineering"               # engineering | design | tutorial | opinion | career
featuredImage: "/images/uploads/placeholder.svg"
featuredImageAlt: "Describe the image"
draft: false
---
```

Posts marked `draft: true` are hidden in production builds and only visible in local development.

### Quick Typo Edits
Because the blog is 100% Git-native, you can fix any typo by navigating to the file on GitHub and pressing `.` to open the web editor. Committing changes automatically triggers an instant rebuild.

## Deployment (Vercel)

1. Push this repository to GitHub.
2. In Vercel, import the repository (framework preset: Astro).
3. The build command (`npm run build`) and output directory (`dist`) are pre-configured in `vercel.json`.
