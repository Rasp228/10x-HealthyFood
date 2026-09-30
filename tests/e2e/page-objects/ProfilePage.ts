import { type Page, type Locator, expect } from "@playwright/test";

/** Toasty karty celu - kopie napisów z `DailyGoalCard`; suita E2E nie importuje z `src`. */
const GOAL_SAVED_TOAST = "Dzienny cel kaloryczny został zapisany";
const GOAL_CLEARED_TOAST = "Dzienny cel kaloryczny został usunięty";

export class ProfilePage {
  readonly page: Page;
  readonly goalCard: Locator;
  readonly goalInput: Locator;
  readonly goalSaveButton: Locator;
  readonly goalClearButton: Locator;
  readonly goalError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.goalCard = page.getByTestId("daily-goal-card");
    this.goalInput = page.getByTestId("daily-goal-input");
    this.goalSaveButton = page.getByTestId("daily-goal-save");
    this.goalClearButton = page.getByTestId("daily-goal-clear");
    this.goalError = page.getByTestId("daily-goal-error");
  }

  async goto() {
    await this.page.goto("/profile");
    await this.expectGoalCardReady();
  }

  /**
   * Karta pobiera cel po stronie klienta i do końca pobrania trzyma pole wyłączone - także w HTML-u
   * z SSR, zanim wyspa ożyje. Włączone pole znaczy więc: wyspa zhydratowana, cel wczytany.
   */
  async expectGoalCardReady() {
    await expect(this.goalCard).toBeVisible({ timeout: 15000 });
    await expect(this.goalInput).toBeEnabled({ timeout: 15000 });
  }

  /**
   * Zapisuje cel. Kończy się na toaście sukcesu i polu zasianym zapisaną wartością - toast
   * pojawia się dopiero po odpowiedzi 200, więc potwierdza zapis, a nie samo kliknięcie.
   */
  async setGoal(calories: number) {
    await this.expectGoalCardReady();
    await this.goalInput.fill(String(calories));
    await this.goalSaveButton.click();

    await expect(this.page.getByText(GOAL_SAVED_TOAST, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(this.goalClearButton).toBeVisible();
    await expect(this.goalInput).toHaveValue(String(calories));
    await expect(this.goalInput).toBeEnabled();
  }

  /**
   * Usuwa zapisany cel przyciskiem „Usuń cel". Przycisk rysuje się tylko przy zapisanym celu,
   * więc jego zniknięcie razem z pustym polem potwierdza, że serwer odesłał `null`.
   */
  async clearGoal() {
    await this.expectGoalCardReady();
    await expect(this.goalClearButton).toBeVisible();
    await this.goalClearButton.click();

    await expect(this.page.getByText(GOAL_CLEARED_TOAST, { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(this.goalClearButton).toHaveCount(0);
    await expect(this.goalInput).toHaveValue("");
  }
}
