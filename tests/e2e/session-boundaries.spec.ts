import { expect, test, type Browser, type BrowserContext, type Cookie } from "@playwright/test";
import { LoginPage, type LoginCredentials } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

/**
 * Granice sesji: wylogowanie kończy sesję **na serwerze**, nie tylko w przeglądarce.
 *
 * Dowodem nie jest to, że ciasteczko zniknęło z przeglądarki, tylko odpowiedź serwera na
 * ciasteczka sprzed wylogowania, odtworzone w świeżym kontekście, który nie dzielił stanu
 * z przeglądarką. Kontrola pozytywna (te same ciasteczka otwierają `/diary` przed wylogowaniem)
 * wyklucza wynik pusty, w którym odtworzenie nigdy nie działało.
 *
 * **Globalne wylogowanie konta testowego.** `/api/auth/logout` woła `signOut()` z domyślnym
 * zakresem `global`, więc GoTrue unieważnia **wszystkie** sesje konta testowego, nie tylko tę
 * z tego speca. Playwright ma `workers: 1`, a każdy spec loguje się sam, więc kolejne specy nie
 * cierpią. Ten spec nie może jednak dzielić kontekstu ani sesji z żadnym innym.
 *
 * Wszystkie żądania są GET, więc bez nagłówka `Origin` (`security.checkOrigin` dotyczy tylko
 * metod zmieniających stan). Scenariusz niczego nie zapisuje - nie ma czego sprzątać.
 */

/** Trasa strony chronionej - poza `PUBLIC_PATHS`, więc bez sesji middleware kieruje na logowanie. */
const PROTECTED_PAGE = "/diary";

/** Trasa API chroniona tylko przez middleware - strona ma drugą linię obrony w layoucie, API nie. */
const PROTECTED_API = "/api/user-settings";

/**
 * Świeży kontekst z odtworzonymi ciasteczkami. `browser.newContext()` nie musi dziedziczyć
 * `use.baseURL` z konfiguracji, więc podajemy go jawnie.
 */
async function contextWithCookies(browser: Browser, baseURL: string, cookies: Cookie[]): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  await context.addCookies(cookies);
  return context;
}

test.describe("Session boundaries", () => {
  const testCredentials: LoginCredentials = getTestCredentials();

  test("wylogowanie unieważnia sesję na serwerze - odtworzone ciasteczka nie otwierają strony ani API", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3000";
    const loginPage = new LoginPage(page);

    // 1. Logowanie
    await loginPage.goto();
    await loginPage.login(testCredentials.email, testCredentials.password);
    await loginPage.expectSuccessfulLogin();

    // 2. Po logowaniu użytkownik ląduje na stronie głównej (D6)
    expect(new URL(page.url()).pathname).toBe("/");

    // 3. Ciasteczka sesji sprzed wylogowania
    const cookiesBeforeLogout = await context.cookies();
    expect(cookiesBeforeLogout.length).toBeGreaterThan(0);

    // 4. Kontrola pozytywna: te same ciasteczka w świeżym kontekście otwierają stronę chronioną
    const controlContext = await contextWithCookies(browser, base, cookiesBeforeLogout);
    try {
      const controlResponse = await controlContext.request.get(PROTECTED_PAGE, { maxRedirects: 0 });
      expect(controlResponse.status()).toBe(200);
    } finally {
      await controlContext.close();
    }

    // 5. „Wyloguj” - czekamy na odpowiedź serwera i na stronę logowania
    const logoutResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith("/api/auth/logout") && response.request().method() === "POST"
    );
    await page.locator("#logout-button").click();
    const logoutResponse = await logoutResponsePromise;
    expect(logoutResponse.status()).toBe(200);
    await page.waitForURL("**/auth/login");

    // 6. Ciasteczka sprzed wylogowania w kolejnym świeżym kontekście nie otwierają już niczego
    const replayContext = await contextWithCookies(browser, base, cookiesBeforeLogout);
    try {
      const pageResponse = await replayContext.request.get(PROTECTED_PAGE, { maxRedirects: 0 });
      expect(pageResponse.status()).toBe(302);
      expect(pageResponse.headers()["location"]).toMatch(/\/auth\/login$/);

      // Trasa API bez sesji też dostaje 302, nie 401 (D2)
      const apiResponse = await replayContext.request.get(PROTECTED_API, { maxRedirects: 0 });
      expect(apiResponse.status()).toBe(302);
      expect(apiResponse.headers()["location"]).toMatch(/\/auth\/login$/);

      const replayPage = await replayContext.newPage();
      await replayPage.goto("/");
      await expect(replayPage).toHaveURL(/\/auth\/login$/);
    } finally {
      await replayContext.close();
    }
  });
});
