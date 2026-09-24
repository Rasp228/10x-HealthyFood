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
    // Szczyt łańcucha budżetów czasu, i łańcuch ten musi opadać ostro, a nie po równo:
    // 60 s platformy > 55 s klienta OpenRoutera (calorie-estimation.service.ts) < 65 s abortu
    // przeglądarki (`ESTIMATION_ABORT_MS`). Zapas na dole bierze się stąd, że trasa zużywa czas na
    // `getUser()` i UPDATE ze znacznikiem, zanim w ogóle zawoła model - przy 60 = 60 platforma
    // ubijała funkcję przed timeoutem klienta i 502 `AI_UNAVAILABLE` nie miało jak powstać.
    // Bez jawnej deklaracji obowiązuje domyślny limit konta, a jeśli jest niższy niż minuta,
    // platforma utnie funkcję w połowie wywołania modelu - i zobaczymy to dopiero na produkcji.
    maxDuration: 60,
  }),
  // Włączamy prefetch dla lepszego doświadczenia użytkownika
  prefetch: true,
});
