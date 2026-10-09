import { test as setup, expect } from "@playwright/test";

const authFile = "playwright/.auth/user.json";

/**
 * Loguje konto testowe raz przez prawdziwy formularz i zapisuje sesję dla projektu `chromium`
 * (storageState). Poświadczenia z `.env.test`, ładowanego przez `npm run test:e2e` (TEST_MODE).
 */
setup("sign in once and save the session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD (see context/foundation/test-stack.md, ## E2E)");
  }

  await page.goto("/auth/login");
  // Formularz to wyspa React: tekst wpisany przed hydratacją przepada. Logowanie jest idempotentne,
  // więc ponawiamy fill + submit, aż submit opuści stronę logowania. `fill("")` przed wartością,
  // bo ponowne wpisanie tego samego tekstu nie wyzwala zdarzenia zmiany.
  await expect(async () => {
    await page.getByLabel("Email").fill("");
    await page.getByLabel("Email").fill(username);
    await page.getByLabel("Hasło", { exact: true }).fill("");
    await page.getByLabel("Hasło", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), { timeout: 5_000 });
  }).toPass();
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
