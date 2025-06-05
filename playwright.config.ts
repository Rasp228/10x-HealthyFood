import { defineConfig, devices } from "@playwright/test";

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
  retries: process.env.CI ? 2 : 0,

  // Liczba worker'ów
  workers: process.env.CI ? 1 : undefined,

  // Reporter dla wyników testów
  reporter: [
    ["html"],
    ["json", { outputFile: "test-results/e2e-results.json" }],
    ...(process.env.CI ? [["github"] as const] : []),
  ],

  // Globalna konfiguracja dla wszystkich projektów
  use: {
    // URL podstawowy dla testów (localhost podczas developmentu)
    baseURL: process.env.BASE_URL || "http://localhost:4321",

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
  },

  // Projekty testowe dla różnych przeglądarek
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    // Testy mobilne
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  // Web Server do uruchomienia przed testami
  webServer: {
    command: "npm run preview",
    port: 4321,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
