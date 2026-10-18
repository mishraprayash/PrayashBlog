// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import { transformerMetaHighlight, transformerNotationDiff } from "@shikijs/transformers";
import { notebookDark, notebookLight } from "./src/lib/markdown/shiki-themes";
import {
  rehypeCallouts,
  rehypeHeadingAnchors,
  rehypeTables,
  rehypeTodos,
  transformerCodeBlock,
} from "./src/lib/markdown/rehype-plugins";

// https://astro.build/config
export default defineConfig({
  site: "https://prayashmishra.com",
  // One URL per page: no trailing slash. vercel.json redirects /x/ to /x.
  trailingSlash: "never",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Custom theme pair built from the page palette; colours are switched by
      // [data-theme] in src/styles/prose.css.
      themes: { light: notebookLight, dark: notebookDark },
      defaultColor: false,
      wrap: false,
      transformers: [transformerMetaHighlight(), transformerNotationDiff(), transformerCodeBlock()],
    },
    // Custom plugins need the unified pipeline (@astrojs/markdown-remark);
    // rehypeHeadingIds runs first so the heading anchors have ids to link to.
    rehypePlugins: [rehypeHeadingIds, rehypeCallouts, rehypeTables, rehypeHeadingAnchors, rehypeTodos],
  },
});
