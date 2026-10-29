import type { APIRoute, GetStaticPaths } from "astro";
import { PILLARS, type PillarId } from "../../data/taxonomy";
import { getPosts, headline } from "../../lib/posts";
import { renderCard } from "../../lib/og";
import { SITE } from "../../lib/seo";

// Same fills as the site; postgresql is the one pillar with light text.
const FILL: Record<PillarId, [string, string]> = {
  messaging: ["#d77c60", "#1b1814"],
  postgresql: ["#6198c6", "#1b1814"],
  "running-services": ["#64aa85", "#1b1814"],
  "network-edge": ["#9b86c1", "#1b1814"],
};

export const getStaticPaths = (async () => {
  const posts = await getPosts();
  return [
    { params: { slug: "site" }, props: { kicker: "Backend engineering", title: "Systems, broken down." } },
    ...posts.map((post) => ({
      params: { slug: post.id },
      props: { kicker: PILLARS[post.data.pillar].title, title: headline(post), pillar: post.data.pillar },
    })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const [fill, ink] = props.pillar ? FILL[props.pillar as PillarId] : ["#1b1814", "#f4f0e7"];
  const png = await renderCard({ kicker: props.kicker as string, title: props.title as string, fill, ink, footer: new URL(SITE.url).host });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
