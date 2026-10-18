import { getCollection, render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { SITE } from "../lib/seo";

export async function GET(context: APIContext) {
  const posts = await getCollection("blog", ({ data }) => {
    if (import.meta.env.PROD) return !data.draft;
    return true;
  });

  posts.sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());
  const lastBuild = new Date(
    Math.max(...posts.map((p) => (p.data.updatedDate ?? p.data.publishDate).getTime())),
  ).toUTCString();

  const site = context.site ?? "https://prayashmishra.com";

  const items = await Promise.all(
    posts.map(async (post) => {
      const { Content } = await render(post);
      const container = await AstroContainer.create();
      // Copy buttons are page UI; in a feed reader they would show up as stray text.
      const html = (await container.renderToString(Content)).replace(/<button[^>]*>.*?<\/button>/g, "");
      return {
        title: post.data.title,
        description: post.data.updateSummary
          ? `[Updated: ${post.data.updateSummary}] ${post.data.description}`
          : post.data.description,
        pubDate: post.data.publishDate,
        link: new URL(`/blog/${post.id}`, site).toString(),
        categories: post.data.tags,
        author: post.data.author,
        content: html,
        customData: post.data.updatedDate
          ? `<dc:date>${post.data.updatedDate.toISOString()}</dc:date>`
          : undefined,
      };
    })
  );

  return rss({
    title: SITE.name,
    description: "Backend engineering: distributed systems, reliability, and the network edge.",
    site,
    items,
    // `dc:date` is emitted per item when a post has been revised, so the `dc`
    // prefix has to be declared on the root element or strict readers reject
    // the whole feed.
    customData: `<language>en-us</language><lastBuildDate>${lastBuild}</lastBuildDate><dc:creator>${SITE.name}</dc:creator>`,
    xmlns: { dc: "http://purl.org/dc/elements/1.1/" },
  });
}
