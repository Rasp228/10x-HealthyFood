import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Ładuj zmienne środowiskowe z .env.test jeśli uruchamiamy testy E2E
if (process.env.NODE_ENV === "test" || process.env.TEST_MODE) {
  config({ path: ".env.test" });
}

/**
 * Konfiguracja Playwright dla testów E2E
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Katalog z testami E2E
  testDir: "./tests/e2e",

  // Timeout dla poszczególnych testów
  timeout: 30_000,

  // Timeout dla expect assertions
  expect: {
    timeout: 5_000,
  },

  // Uruchom testy w trybie "fail fast" w CI
  fullyParallel: true,

  // Nie wykorzystuj worker'ów w CI
  forbidOnly: !!process.env.CI,

  // Retry w przypadku niepowodzenia
  retries: process.env.CI ? 2 : 1,

  // Liczba worker'ów - ograniczona dla Dockera
  workers: 1,

  // Reporter dla wyników testów
  reporter: [["html"], ["list"], ...(process.env.CI ? [["github"] as const] : [])],

  // Globalna konfiguracja dla wszystkich projektów
  use: {
    // URL podstawowy dla testów
    baseURL: "http://localhost:3000",

    // Śledzenie dla debugowania testów
    trace: "on-first-retry",

    // Screenshots w przypadku niepowodzenia
    screenshot: "only-on-failure",

    // Video w przypadku niepowodzenia
    video: "retain-on-failure",

    // Timeout dla akcji
    actionTimeout: 10_000,

    // Timeout dla nawigacji
    navigationTimeout: 30_000,

    // Ustawienia dla środowiska Docker
    launchOptions: {
      // Headless mode w Docker
      headless: true,
      // Argumenty dla Chromium w Docker
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-ipc-flooding-protection",
        "--disable-extensions",
        "--disable-default-apps",
        "--disable-translate",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-software-rasterizer",
        "--disable-gpu",
        "--disable-gpu-sandbox",
        "--allow-running-insecure-content",
        "--disable-site-isolation-trials",
        "--disable-features=TranslateUI,BlinkGenPropertyTrees",
      ],
    },
  },

  // Projekty testowe - tylko Chromium dla Docker
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  // Web Server do uruchomienia przed testami
  webServer: {
    command: "npm run dev:e2e",
    url: "http://localhost:3000",
    reuseExistingServer: true, // Używaj istniejącego serwera
    timeout: 120_000,
  },
});
