// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import { transformerMetaHighlight, transformerNotationDiff } from "@shikijs/transformers";
import { pressTheme } from "./src/lib/markdown/shiki-themes";
import {
  rehypeCallouts,
  rehypeHeadingAnchors,
  rehypeSectionNumbers,
  rehypeTables,
  rehypeTaskLists,
  rehypeTodos,
  transformerCodeBlock,
} from "./src/lib/markdown/rehype-plugins";
import { rehypeStories } from "./src/lib/markdown/rehype-story";

// https://astro.build/config
export default defineConfig({
  site: "https://prayashmishra.com",
  // One URL per page: no trailing slash. vercel.json redirects /x/ to /x.
  trailingSlash: "never",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Code always sits on a dark panel, in both site themes.
      theme: pressTheme,
      wrap: false,
      transformers: [transformerMetaHighlight(), transformerNotationDiff(), transformerCodeBlock()],
    },
    // Custom plugins need the unified pipeline (@astrojs/markdown-remark);
    // rehypeHeadingIds runs first so the heading anchors have ids to link to.
    // rehypeStories builds the scroll diagrams from src/lib/diagrams.
    rehypePlugins: [rehypeHeadingIds, rehypeSectionNumbers, rehypeStories, rehypeCallouts, rehypeTables, rehypeHeadingAnchors, rehypeTodos, rehypeTaskLists],
  },
});
