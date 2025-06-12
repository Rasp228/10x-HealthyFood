// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  site: "https://your-domain.vercel.app", // Zmień na swoją domenę
  output: "server",
  integrations: [react(), sitemap()],
  server: {
    host: true,
    port: 3000,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
  // Włączamy prefetch dla lepszego doświadczenia użytkownika
  prefetch: true,
});
