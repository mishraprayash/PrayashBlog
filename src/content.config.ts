import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

export const CATEGORIES = [
  "engineering",
  "design",
  "tutorial",
  "opinion",
  "career",
] as const;

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    // NOTE: the glob loader derives `entry.id` from this field, which is what
    // [...slug].astro routes on. src/data/series.ts must be kept in sync with
    // these values or series banners silently stop rendering.
    slug: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    updateSummary: z.string().optional(),
    author: z.string(),
    tags: z.array(z.string()).default([]),
    category: z.enum(CATEGORIES).optional(),
    // Opt in to the homepage "Featured Deep Dive" slot. Without this the slot
    // silently falls back to the most recently published post.
    featured: z.boolean().default(false),
    featuredImage: z.string().optional(),
    featuredImageAlt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  blog: blogCollection,
};
