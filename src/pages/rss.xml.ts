import { getCollection, render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const posts = await getCollection("blog", ({ data }) => {
    if (import.meta.env.PROD) return !data.draft;
    return true;
  });

  posts.sort((a, b) => {
    const dateA = a.data.updatedDate ? Math.max(a.data.publishDate.getTime(), a.data.updatedDate.getTime()) : a.data.publishDate.getTime();
    const dateB = b.data.updatedDate ? Math.max(b.data.publishDate.getTime(), b.data.updatedDate.getTime()) : b.data.publishDate.getTime();
    return dateB - dateA;
  });

  const site = context.site ?? "https://prayashmishra.com";

  const items = await Promise.all(
    posts.map(async (post) => {
      const { Content } = await render(post);
      const container = await AstroContainer.create();
      const html = await container.renderToString(Content);
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
    title: "Prayash Mishra Blog",
    description: "In-depth analysis of backend systems, security, and AI/ML.",
    site,
    items,
    customData: `<language>en-us</language>`,
  });
}
