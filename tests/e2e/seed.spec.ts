import { test, expect } from "@playwright/test";

/**
 * Seed E2E - wzorzec, który kopiuje każdy kolejny test (/10x-e2e).
 *
 * Ryzyko #3 (context/foundation/test-plan.md): sesja zalogowanego użytkownika gubi się między
 * żądaniami - np. zrotowany token nie dociera do przeglądarki (lessons.md, `flushCookies`) - i
 * chroniona strona przekierowuje na logowanie. Test startuje z sesją zapisaną przez `setup`
 * (storageState), więc nie loguje się przez UI.
 *
 * Scenariusz niczego nie zapisuje - nie ma czego sprzątać. Nie wylogowujemy się na koniec:
 * wylogowanie jest globalne i unieważniłoby zapisaną sesję dla pozostałych speców.
 */
test("zalogowany użytkownik otwiera /diary i zostaje na nim po przeładowaniu - bez przekierowania na logowanie", async ({
  page,
}) => {
  await page.goto("/diary");

  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByRole("heading", { name: "Dziennik posiłków", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeVisible();

  // Drugie żądanie idzie z ciasteczkami, które middleware wypisał przy pierwszym.
  await page.reload();

  await expect(page).toHaveURL(/\/diary$/);
  await expect(page.getByRole("heading", { name: "Dziennik posiłków", level: 1 })).toBeVisible();
});
