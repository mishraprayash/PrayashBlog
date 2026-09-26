// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://prayashmishra.com",
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    shikiConfig: {
      // Dual themes: tokens are emitted as CSS custom properties and the
      // active palette is switched by the `.dark` class in global.css. The
      // previous single `github-dark-default` theme meant light mode rendered
      // near-black code slabs on a cream page.
      themes: {
        light: "github-light-default",
        dark: "github-dark-default",
      },
      defaultColor: false,
      wrap: false,
    },
  },
});
