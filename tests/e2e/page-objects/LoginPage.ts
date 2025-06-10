import { type Page, type Locator, expect } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly loginFormContainer: Locator;
  readonly loginForm: Locator;
  readonly loginFormTitle: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly emailError: Locator;
  readonly passwordError: Locator;
  readonly forgotPasswordLink: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loginFormContainer = page.getByTestId("login-form");
    this.loginForm = page.getByTestId("login-form-container");
    this.loginFormTitle = page.getByTestId("login-form-title");
    this.emailInput = page.getByTestId("login-email-input");
    this.passwordInput = page.getByTestId("login-password-input");
    this.submitButton = page.getByTestId("login-submit-button");
    this.errorMessage = page.getByTestId("login-error-message");
    this.emailError = page.getByTestId("login-email-error");
    this.passwordError = page.getByTestId("login-password-error");
    this.forgotPasswordLink = page.getByTestId("login-forgot-password-link");
    this.registerLink = page.getByTestId("login-register-link");
  }

  async goto() {
    await this.page.goto("/auth/login");
  }

  async login(email: string, password: string) {
    // Czekaj na załadowanie i hydration komponentu React
    await expect(this.loginForm).toBeVisible();
    await expect(this.submitButton).toBeEnabled();

    // Wypełnij pola
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    // Upewnij się, że formularz jest gotowy do wysłania
    await expect(this.emailInput).toHaveValue(email);
    await expect(this.passwordInput).toHaveValue(password);

    // Czekaj krótki czas na React hydration
    await this.page.waitForTimeout(500);

    // Kliknij przycisk submit
    await this.submitButton.click();
  }

  async expectLoginFormVisible() {
    await expect(this.loginFormContainer).toBeVisible();
    await expect(this.loginFormTitle).toHaveText("Logowanie");
  }

  async expectEmailError(errorText: string) {
    await expect(this.emailError).toBeVisible();
    await expect(this.emailError).toHaveText(errorText);
  }

  async expectPasswordError(errorText: string) {
    await expect(this.passwordError).toBeVisible();
    await expect(this.passwordError).toHaveText(errorText);
  }

  async expectLoginError(errorText: string) {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(errorText);
  }

  // async expectSuccessfulLogin() {
  //   // Poczekaj na zakończenie procesu logowania i przekierowanie
  //   await this.page.waitForURL(/\/$/, { timeout: 30000 });
  // }

  async expectLoadingState() {
    await expect(this.submitButton).toBeDisabled();
    await expect(this.submitButton).toContainText("Logowanie...");
  }

  async clickForgotPassword() {
    await this.forgotPasswordLink.click();
  }

  async clickRegister() {
    await this.registerLink.click();
  }

  async expectValidationErrors() {
    // Sprawdz czy formularz pokazuje błędy walidacji bez wysyłania
    await this.submitButton.click();

    // Zakładamy, że puste pola wywołają błędy
    await expect(this.emailError).toBeVisible();
    await expect(this.passwordError).toBeVisible();
  }

  async clearForm() {
    await this.emailInput.clear();
    await this.passwordInput.clear();
  }
}
