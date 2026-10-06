import { expect, test, type Browser, type BrowserContext, type Cookie } from "@playwright/test";
import { HomePage, LoginPage, type LoginCredentials } from "./page-objects";
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
 * `workers: 1` chroni tylko jeden przebieg: dwa równoległe przebiegi na tym samym koncie (pipeline'y
 * CI z różnych gałęzi - grupa `concurrency` jest per ref - albo lokalne `test:e2e` na projekcie
 * `integration`) zobaczą, jak ten spec wylogowuje je w połowie testu. Sporadyczny czerwony
 * z przekierowaniem na `/auth/login` w innym specu zacznij od tego; trwała naprawa to osobne konto
 * dla tego speca (`follow-ups/review-fixes.md`).
 *
 * Wszystkie żądania są GET, więc bez nagłówka `Origin` (`security.checkOrigin` dotyczy tylko
 * metod zmieniających stan). Scenariusz niczego nie zapisuje - nie ma czego sprzątać.
 */

/** Trasa strony chronionej - poza `PUBLIC_PATHS`, więc bez sesji middleware kieruje na logowanie. */
const PROTECTED_PAGE = "/diary";

/** Trasa API chroniona tylko przez middleware - strona ma drugą linię obrony w layoucie, API nie. */
const PROTECTED_API = "/api/user-settings";

/**
 * Uruchamia `check` w świeżym kontekście z odtworzonymi ciasteczkami i zamyka go po sobie.
 * `browser.newContext()` nie musi dziedziczyć `use.baseURL` z konfiguracji, więc podajemy go jawnie.
 *
 * Jeden kontekst na jedno sprawdzenie: `context.request` zapisuje `Set-Cookie` z odpowiedzi do
 * słoika kontekstu, a middleware po odrzuconej sesji wypuszcza ciasteczka kasujące. Drugie żądanie
 * w tym samym kontekście szłoby już bez odtworzonych ciasteczek i przeszłoby trywialnie.
 */
async function withReplayedCookies(
  browser: Browser,
  baseURL: string,
  cookies: Cookie[],
  check: (context: BrowserContext) => Promise<void>
): Promise<void> {
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies(cookies);
    await check(context);
  } finally {
    await context.close();
  }
}

test.describe("Session boundaries", () => {
  const testCredentials: LoginCredentials = getTestCredentials();

  test("wylogowanie unieważnia sesję na serwerze - odtworzone ciasteczka nie otwierają strony ani API", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    // `playwright.config.ts` zawsze ustawia `baseURL` (z `E2E_BASE_URL` albo `E2E_PORT`); własny
    // domyślny adres po cichu ominąłby oba nadpisania.
    if (!baseURL) {
      throw new Error("Brak baseURL - spec wymaga use.baseURL z playwright.config.ts");
    }
    const base = baseURL;
    const loginPage = new LoginPage(page);
    const homePage = new HomePage(page);

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
    await withReplayedCookies(browser, base, cookiesBeforeLogout, async (control) => {
      const controlResponse = await control.request.get(PROTECTED_PAGE, { maxRedirects: 0 });
      expect(controlResponse.status()).toBe(200);
    });

    // 5. „Wyloguj” - czekamy na odpowiedź serwera i na stronę logowania
    const logoutResponse = await homePage.logout();
    expect(logoutResponse.status()).toBe(200);

    // 6. Ciasteczka sprzed wylogowania nie otwierają już niczego. Każde sprawdzenie w osobnym
    //    świeżym kontekście, żeby żadne nie biegło na ciasteczkach skasowanych przez poprzednie.
    await withReplayedCookies(browser, base, cookiesBeforeLogout, async (replay) => {
      const pageResponse = await replay.request.get(PROTECTED_PAGE, { maxRedirects: 0 });
      expect(pageResponse.status()).toBe(302);
      expect(pageResponse.headers()["location"]).toMatch(/\/auth\/login$/);
    });

    // Trasa API bez sesji też dostaje 302, nie 401 (D2)
    await withReplayedCookies(browser, base, cookiesBeforeLogout, async (replay) => {
      const apiResponse = await replay.request.get(PROTECTED_API, { maxRedirects: 0 });
      expect(apiResponse.status()).toBe(302);
      expect(apiResponse.headers()["location"]).toMatch(/\/auth\/login$/);
    });

    await withReplayedCookies(browser, base, cookiesBeforeLogout, async (replay) => {
      const replayPage = await replay.newPage();
      await replayPage.goto("/");
      await expect(replayPage).toHaveURL(/\/auth\/login$/);
    });
  });
});
