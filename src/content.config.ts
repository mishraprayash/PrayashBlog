import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { PILLAR_IDS, TAGS } from "./data/taxonomy";
import { SERIES_IDS } from "./data/series";

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z
    .object({
      title: z.string(),
      // The glob loader derives `entry.id` from this field, which is what
      // [...slug].astro routes on. Changing it changes the post's URL.
      slug: z.string().regex(/^[a-z0-9-]+$/),
      description: z.string(),
      publishDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      // Reader-facing: shown under "Revised" on the post and in the feed.
      updateSummary: z.string().optional(),
      author: z.string(),
      pillar: z.enum(PILLAR_IDS),
      tags: z.array(z.enum(TAGS)).max(4).default([]),
      series: z.enum(SERIES_IDS).optional(),
      seriesPart: z.number().int().positive().optional(),
      // Position (1-3) in the homepage "Start here" list.
      startHere: z.number().int().min(1).max(3).optional(),
      // Slugs shown first under "Related"; the rest are computed.
      related: z.array(z.string()).max(3).default([]),
      featuredImage: z.string().optional(),
      featuredImageAlt: z.string().optional(),
      draft: z.boolean().default(false),
    })
    .refine((d) => (d.series === undefined) === (d.seriesPart === undefined), {
      message: "`series` and `seriesPart` must be set together",
      path: ["seriesPart"],
    }),
});

export const collections = {
  blog: blogCollection,
};
