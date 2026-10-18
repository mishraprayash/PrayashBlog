# Phase 6: Implementation plan

## Stack decision

**Stay on Astro 7.** It already does what the site needs: static pages, content collections, Shiki, RSS, sitemap. Migrating would cost time and gain nothing.

**Move styling from Tailwind utilities to plain CSS with design tokens.** Every template is being rewritten anyway, and the new design is a small set of components built on CSS custom properties (Phase 4). Hand-written CSS for those is shorter and easier to read than long utility strings.

To avoid breaking anything mid-way, Tailwind stays installed until the last milestone, so pages that haven't been rebuilt yet keep working. It's removed in M6, once nothing uses it.

## Milestones

Each one ships on its own, ends with a clean build and screenshots, and pauses for your review.

| # | Milestone | What you'll see | Main files | Done when |
|---|---|---|---|---|
| **M1** | **Foundation** | New fonts, colours, header and footer on every page. Background gradients/noise gone. Mobile header fixed. | `src/styles/tokens.css` (new), `src/styles/global.css`, `src/layouts/BaseLayout.astro`, `astro.config.mjs`, `vercel.json`, `src/lib/seo.ts` | Fonts self-hosted (no Google Fonts); header fits at 360 px with no sideways scroll; theme toggle cycles System/Light/Dark with no flash; canonical, sitemap and links agree on no trailing slash; build and `astro check` clean |
| **M2** | **Content model** | Nothing visible yet | `src/content.config.ts`, all post frontmatter, `src/content/series/*` (new), `src/data/tags.ts` (new), `vercel.json` redirects | Every post has a `pillar`; series declared in posts; tags limited to the 14-tag vocabulary; the build fails on an unknown tag or a broken series; old `?tag=`/`?series=` URLs have redirects |
| **M3** | **Post page** | The new reading layout | `src/pages/blog/[...slug].astro`, `src/components/post/*` (new), `src/styles/prose.css` (new), `src/styles/shiki/notebook-*.json` (new), small remark/rehype plugins in `src/lib/markdown/` | First paragraph above 500 px on desktop; ToC rules; code titles/highlights/copy; callouts; side notes/footnotes; series navigator; related posts; **Copy link button**; no page overflow at 360 px |
| **M4** | **Index pages** | New home, Writing, topic, tag, series and 404 pages | `src/pages/index.astro`, `src/pages/blog/index.astro`, `src/pages/topics/[pillar].astro`, `src/pages/tags/[tag].astro`, `src/pages/series/*`, `src/pages/404.astro` | All pages from Phase 3 exist; Writing is ordered by publish date; redirects verified |
| **M5** | **Projects and About** | Two new pages with `[TODO]`s for you to fill | `src/content/projects/*`, `src/pages/projects/*`, `src/pages/about.astro` | Pages built from the Phase 8 structure; header shows Writing · Projects · About |
| **M6** | **Polish and quality bar** | Social cards, print styles, final cleanup | `src/pages/og/[slug].png.ts`, `src/pages/rss.xml.ts`, print CSS, Tailwind removal, `tests/` (Playwright) | Lighthouse 95+ on all four categories; overflow and contrast tests pass; RSS has `lastBuildDate` |

The writing work (Phase 7) runs alongside M3–M5: rewriting the two strongest posts and producing the per-post improvement plans.
