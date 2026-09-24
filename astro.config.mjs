// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";
import process from "node:process";

// https://astro.build/config
export default defineConfig({
  // Vercel podaje domenę produkcyjną (także własną, jeśli przypisana) w zmiennej systemowej,
  // więc nie trzymamy jej zaszytej w repo. Lokalnie i w CI schodzimy na localhost - sitemap
  // generowany poza Vercelem i tak nie trafia na produkcję.
  site: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000",
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
    // Szczyt łańcucha budżetów czasu: pod tą liczbą stoi `timeout: 60_000` klienta OpenRoutera
    // (calorie-estimation.service.ts). Bez jawnej deklaracji obowiązuje domyślny limit konta,
    // a jeśli jest niższy niż minuta, platforma utnie funkcję w połowie wywołania modelu -
    // i zobaczymy to dopiero na produkcji.
    maxDuration: 60,
  }),
  // Włączamy prefetch dla lepszego doświadczenia użytkownika
  prefetch: true,
});
