export const SITE = {
  name: "Prayash Mishra",
  url: "https://prayashmishra.com",
  tagline: "Backend Engineer",
  description:
    "Backend engineer writing about how distributed systems fail where they meet databases, message brokers, sidecars and the network, and what it takes to make them hold.",
  locale: "en_US",
} as const;

export const DEFAULT_OG_IMAGE = "/images/default-og.png";

/**
 * Extensions that X, LinkedIn, Facebook and Slack will actually render in a
 * link preview. Notably absent: SVG, which every major platform refuses.
 */
const SOCIAL_SAFE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/**
 * Resolve a post's featured image to something safe to put in an og:image /
 * twitter:image / JSON-LD image field.
 *
 * Social previews silently fail on SVG, so an SVG (or a missing) featuredImage
 * falls back to the site-wide PNG rather than shipping a preview that renders
 * as a blank card. Swap the file at public/images/uploads/* from .svg to .png
 * and it starts being used with no code change.
 */
export function socialImage(
  featuredImage: string | undefined,
  site: URL | undefined = new URL(SITE.url),
): URL {
  const candidate = featuredImage?.trim();

  if (candidate) {
    const isAbsolute = /^https?:\/\//i.test(candidate);
    const pathname = isAbsolute
      ? new URL(candidate).pathname
      : new URL(candidate, site).pathname;
    const dot = pathname.lastIndexOf(".");
    const ext = dot === -1 ? "" : pathname.slice(dot).toLowerCase();

    if (SOCIAL_SAFE_EXTENSIONS.has(ext)) {
      return new URL(candidate, site);
    }
  }

  return new URL(DEFAULT_OG_IMAGE, site);
}

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path: string, site: URL | undefined = new URL(SITE.url)): string {
  return new URL(path, site).href;
}

/**
 * Canonical URL for a pathname, e.g. `/blog/foo`. The site uses no trailing
 * slash (astro.config.mjs `trailingSlash: "never"`), so one is stripped here
 * too; otherwise canonicals and the sitemap disagree.
 */
export function canonicalFor(
  pathname: string,
  site: URL | undefined = new URL(SITE.url),
): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return absoluteUrl(path, site);
}
