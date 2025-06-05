/**
 * Testy E2E dla funkcjonalności autentykacji
 * Zgodnie z planem testów - scenariusze TC-AUTH-001, TC-AUTH-002, TC-AUTH-003
 */

import { test, expect } from "@playwright/test";

test.describe("Autentykacja użytkowników", () => {
  test.beforeEach(async ({ page }) => {
    // Oczyść localStorage i cookies przed każdym testem
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
  });

  test("TC-AUTH-001: Rejestracja nowego użytkownika", async ({ page }) => {
    // Krok 1: Otwórz stronę rejestracji
    await page.goto("/register");

    // Sprawdź czy strona się załadowała
    await expect(page).toHaveTitle(/HealthyMeal/);

    // Krok 2: Wprowadź poprawny email i hasło
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.fill('[data-testid="password-input"]', "SecurePassword123!");
    await page.fill('[data-testid="confirm-password-input"]', "SecurePassword123!");

    // Krok 3: Kliknij "Zarejestruj"
    await page.click('[data-testid="register-button"]');

    // Oczekiwany rezultat: Użytkownik zostaje zarejestrowany i przekierowany na stronę główną
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator('[data-testid="welcome-message"]')).toContainText("Witaj");

    // Sprawdź czy token został zapisany
    const token = await page.evaluate(() => localStorage.getItem("auth-token"));
    expect(token).toBeTruthy();
  });

  test("TC-AUTH-002: Logowanie z poprawnymi danymi", async ({ page }) => {
    // Krok 1: Otwórz stronę logowania
    await page.goto("/login");

    // Krok 2: Wprowadź poprawny email i hasło
    await page.fill('[data-testid="email-input"]', "existing@example.com");
    await page.fill('[data-testid="password-input"]', "ExistingPassword123!");

    // Krok 3: Kliknij "Zaloguj"
    await page.click('[data-testid="login-button"]');

    // Oczekiwany rezultat: Użytkownik zostaje zalogowany
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test("TC-AUTH-003: Wylogowanie", async ({ page }) => {
    // Warunek wstępny: Użytkownik jest zalogowany
    await page.goto("/login");
    await page.fill('[data-testid="email-input"]', "existing@example.com");
    await page.fill('[data-testid="password-input"]', "ExistingPassword123!");
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL("/dashboard");

    // Krok 1: Kliknij przycisk "Wyloguj"
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    // Oczekiwany rezultat: Sesja zostaje zakończona, przekierowanie na stronę logowania
    await expect(page).toHaveURL("/login");
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // Sprawdź czy token został usunięty
    const token = await page.evaluate(() => localStorage.getItem("auth-token"));
    expect(token).toBeNull();
  });

  test("Logowanie z błędnymi danymi", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[data-testid="email-input"]', "wrong@example.com");
    await page.fill('[data-testid="password-input"]', "WrongPassword");
    await page.click('[data-testid="login-button"]');

    // Oczekiwany rezultat: Błąd logowania
    await expect(page.locator('[data-testid="error-message"]')).toContainText("Niepoprawne dane logowania");
    await expect(page).toHaveURL("/login");
  });

  test("Walidacja formularza rejestracji", async ({ page }) => {
    await page.goto("/register");

    // Test pustych pól
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="email-error"]')).toContainText("Email jest wymagany");
    await expect(page.locator('[data-testid="password-error"]')).toContainText("Hasło jest wymagane");

    // Test niepoprawnego emaila
    await page.fill('[data-testid="email-input"]', "invalid-email");
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="email-error"]')).toContainText("Niepoprawny format email");

    // Test słabego hasła
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.fill('[data-testid="password-input"]', "123");
    await page.click('[data-testid="register-button"]');
    await expect(page.locator('[data-testid="password-error"]')).toContainText("Hasło musi mieć co najmniej 8 znaków");
  });

  test("Reset hasła", async ({ page }) => {
    await page.goto("/login");

    // Kliknij link "Zapomniałeś hasła?"
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL("/reset-password");

    // Wprowadź email
    await page.fill('[data-testid="email-input"]', "test@example.com");
    await page.click('[data-testid="reset-button"]');

    // Sprawdź komunikat sukcesu
    await expect(page.locator('[data-testid="success-message"]')).toContainText("Link do resetu hasła został wysłany");
  });
});
