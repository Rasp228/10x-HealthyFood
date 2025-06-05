/**
 * Testy Smoke dla środowiska produkcyjnego
 * Szybkie testy sprawdzające czy podstawowe funkcjonalności działają
 */

import { test, expect } from "@playwright/test";

test.describe("Smoke Tests @smoke", () => {
  test("Strona główna ładuje się poprawnie", async ({ page }) => {
    await page.goto("/");

    // Sprawdź czy strona się załadowała
    await expect(page).toHaveTitle(/HealthyMeal/);

    // Sprawdź czy podstawowe elementy są widoczne
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await expect(page.locator('a[href="/register"]')).toBeVisible();
  });

  test("Strona logowania jest dostępna", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveTitle(/HealthyMeal/);
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
  });

  test("Strona rejestracji jest dostępna", async ({ page }) => {
    await page.goto("/register");

    await expect(page).toHaveTitle(/HealthyMeal/);
    await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
  });

  test("API Health Check", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("status", "ok");
  });

  test("Podstawowe metryki wydajności", async ({ page }) => {
    // Rozpocznij pomiar wydajności
    await page.goto("/", { waitUntil: "networkidle" });

    // Sprawdź czy strona załadowała się w rozsądnym czasie
    const performanceEntries = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        firstContentfulPaint: performance.getEntriesByName("first-contentful-paint")[0]?.startTime || 0,
      };
    });

    // Sprawdź czy metryki są w akceptowalnych granicach (zgodnie z planem testów)
    expect(performanceEntries.loadTime).toBeLessThan(3000); // < 3s
    expect(performanceEntries.domContentLoaded).toBeLessThan(2000); // < 2s

    if (performanceEntries.firstContentfulPaint > 0) {
      expect(performanceEntries.firstContentfulPaint).toBeLessThan(2000); // < 2s FCP
    }
  });

  test("Responsywność na urządzeniach mobilnych", async ({ page }) => {
    // Ustaw viewport na urządzenie mobilne
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // Sprawdź czy strona jest responsywna
    await expect(page.locator("h1")).toBeVisible();

    // Sprawdź czy menu mobilne działa
    const menuButton = page.locator('[data-testid="mobile-menu-button"]');
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
    }
  });

  test("Podstawowe testy dostępności", async ({ page }) => {
    await page.goto("/");

    // Sprawdź czy strona ma odpowiednie atrybuty dostępności
    await expect(page.locator("html")).toHaveAttribute("lang");

    // Sprawdź czy wszystkie obrazy mają alt text
    const images = page.locator("img");
    const imageCount = await images.count();

    for (let i = 0; i < imageCount; i++) {
      const img = images.nth(i);
      await expect(img).toHaveAttribute("alt");
    }

    // Sprawdź czy linki mają dostępne nazwy
    const links = page.locator("a");
    const linkCount = await links.count();

    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const text = await link.textContent();
      const ariaLabel = await link.getAttribute("aria-label");

      expect(text || ariaLabel).toBeTruthy();
    }
  });
});
