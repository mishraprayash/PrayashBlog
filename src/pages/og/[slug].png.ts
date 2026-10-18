import type { APIRoute, GetStaticPaths } from "astro";
import { PILLARS } from "../../data/taxonomy";
import { getPosts } from "../../lib/posts";
import { renderCard } from "../../lib/og";
import { SITE } from "../../lib/seo";

export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return [
    { params: { slug: "site" }, props: { kicker: "Backend engineering", title: "How distributed systems fail, and what actually fixes them" } },
    ...posts.map((post) => ({
      params: { slug: post.id },
      props: { kicker: PILLARS[post.data.pillar].title, title: post.data.title },
    })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard({ kicker: props.kicker as string, title: props.title as string, footer: new URL(SITE.url).host });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
