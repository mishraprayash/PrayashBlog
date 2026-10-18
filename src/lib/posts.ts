import { getCollection, type CollectionEntry } from "astro:content";
import { SERIES, type SeriesId } from "../data/series";
import type { PillarId, Tag } from "../data/taxonomy";

export type Post = CollectionEntry<"blog">;

/** Published posts (drafts too in dev), newest first by publish date. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection("blog", ({ data }) => import.meta.env.DEV || !data.draft);
  posts.sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());
  validate(posts);
  return posts;
}

export const postUrl = (post: Post) => `/blog/${post.id}`;
/** The short headline where there is one, else the full title. */
export const headline = (post: Post) => post.data.headline ?? post.data.title;

// ---------------------------------------------------------------- series

export interface SeriesInfo {
  id: SeriesId;
  title: string;
  description: string;
  parts: Post[];
}

export function getSeries(posts: Post[]): SeriesInfo[] {
  return (Object.keys(SERIES) as SeriesId[])
    .map((id) => ({
      id,
      ...SERIES[id],
      parts: posts
        .filter((p) => p.data.series === id)
        .sort((a, b) => a.data.seriesPart! - b.data.seriesPart!),
    }))
    .filter((s) => s.parts.length > 0);
}

export function seriesFor(post: Post, posts: Post[]): SeriesInfo | undefined {
  return post.data.series ? getSeries(posts).find((s) => s.id === post.data.series) : undefined;
}

// ---------------------------------------------------------------- related

/**
 * Up to `n` related posts: the post's own `related` list first, then the best
 * matches by shared tags (2 points each) and pillar (1 point). Posts in the
 * same series are left out, since the series navigator already links them.
 */
export function relatedPosts(post: Post, posts: Post[], n = 3): Post[] {
  const sameSeries = (p: Post) => post.data.series && p.data.series === post.data.series;
  const bySlug = new Map(posts.map((p) => [p.id, p]));
  const picked = post.data.related.map((slug) => bySlug.get(slug)!).filter(Boolean);

  const scored = posts
    .filter((p) => p.id !== post.id && !sameSeries(p) && !picked.includes(p))
    .map((p) => ({
      p,
      score:
        2 * p.data.tags.filter((t) => post.data.tags.includes(t)).length +
        (p.data.pillar === post.data.pillar ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.data.publishDate.getTime() - a.p.data.publishDate.getTime())
    .map((x) => x.p);

  return [...picked, ...scored].slice(0, n);
}

// ---------------------------------------------------------------- reading time

/**
 * Minutes to read: prose words at 230 wpm, plus a minute per 25 lines of code.
 * Counting code as prose words overstates code-heavy posts.
 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  let codeLines = 0;
  const prose = body.replace(/^```[^\n]*\n([\s\S]*?)^```/gm, (_m, code: string) => {
    codeLines += code.split("\n").length;
    return "";
  });
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230 + codeLines / 25));
}

// ---------------------------------------------------------------- formatting

// Spelled out rather than Intl, whose en-GB short month for September is "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `9 Sep 2026`, unambiguous across locales. */
export const formatDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
/** `9 Sep`, for lists already grouped by year. */
export const formatShortDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

export const postsByPillar = (posts: Post[], pillar: PillarId) => posts.filter((p) => p.data.pillar === pillar);
export const postsByTag = (posts: Post[], tag: Tag) => posts.filter((p) => p.data.tags.includes(tag));

// ---------------------------------------------------------------- validation

let validated = false;

/**
 * Checks that can't be expressed in the per-post schema. Each one used to be
 * a silent failure (a series banner vanishing, a related link 404ing).
 */
function validate(posts: Post[]) {
  if (validated) return;
  const errors: string[] = [];
  const slugs = new Set(posts.map((p) => p.id));

  for (const p of posts) {
    for (const r of p.data.related) {
      if (!slugs.has(r)) errors.push(`${p.id}: related post "${r}" does not exist`);
      if (r === p.id) errors.push(`${p.id}: lists itself as related`);
    }
  }

  for (const s of getSeries(posts)) {
    const parts = s.parts.map((p) => p.data.seriesPart!);
    parts.forEach((n, i) => {
      if (n !== i + 1) errors.push(`series "${s.id}": parts are ${parts.join(", ")}; expected 1..${parts.length} with no gaps or duplicates`);
    });
  }

  const starts = posts.map((p) => p.data.startHere).filter((n) => n !== undefined);
  if (new Set(starts).size !== starts.length) errors.push(`startHere positions are duplicated: ${starts.join(", ")}`);

  if (errors.length) throw new Error(`Content checks failed:\n  - ${[...new Set(errors)].join("\n  - ")}`);
  validated = true;
}
