import { type Page, type Locator, expect } from "@playwright/test";

export interface DiaryEntryData {
  content: string;
  amount?: string;
  calories?: string;
}

export class DiaryPage {
  readonly page: Page;
  readonly diaryPage: Locator;
  readonly dayNavigator: Locator;
  readonly dayInput: Locator;
  readonly previousDayButton: Locator;
  readonly nextDayButton: Locator;
  readonly todayButton: Locator;
  readonly entryForm: Locator;
  readonly contentInput: Locator;
  readonly contentError: Locator;
  readonly amountInput: Locator;
  readonly amountError: Locator;
  readonly caloriesInput: Locator;
  readonly caloriesError: Locator;
  readonly submitButton: Locator;
  readonly entryList: Locator;
  readonly entryContents: Locator;
  readonly emptyState: Locator;
  readonly daySummary: Locator;
  readonly dayTotal: Locator;
  readonly dayMissing: Locator;
  readonly dayCount: Locator;

  constructor(page: Page) {
    this.page = page;
    this.diaryPage = page.getByTestId("diary-page");
    this.dayNavigator = page.getByTestId("day-navigator");
    this.dayInput = page.getByTestId("day-date-input");
    this.previousDayButton = page.getByTestId("day-previous-button");
    this.nextDayButton = page.getByTestId("day-next-button");
    this.todayButton = page.getByTestId("day-today-button");
    this.entryForm = page.getByTestId("diary-entry-form");
    this.contentInput = page.getByTestId("diary-content-input");
    this.contentError = page.getByTestId("diary-content-error");
    this.amountInput = page.getByTestId("diary-amount-input");
    this.amountError = page.getByTestId("diary-amount-error");
    this.caloriesInput = page.getByTestId("diary-calories-input");
    this.caloriesError = page.getByTestId("diary-calories-error");
    this.submitButton = page.getByTestId("diary-submit-button");
    this.entryList = page.getByTestId("diary-entry-list");
    this.entryContents = page.getByTestId("diary-entry-content");
    this.emptyState = page.getByTestId("diary-empty-state");
    this.daySummary = page.getByTestId("diary-day-summary");
    this.dayTotal = page.getByTestId("diary-day-total");
    this.dayMissing = page.getByTestId("diary-day-missing");
    this.dayCount = page.getByTestId("diary-day-count");
  }

  /**
   * Otwiera dziennik od razu na wskazanym dniu.
   *
   * Dzień podróżuje w query stringu, więc test nie musi doklikiwać się strzałkami do dnia
   * odległego od dzisiaj.
   */
  async goto(day: string) {
    await this.page.goto(`/diary?date=${day}`);
    await this.expectDiaryVisible();
    await this.waitForDaySettled();
  }

  /**
   * Panel rysuje się dopiero po hydratacji - do pierwszej migawki klienckiej wyspa nie zna
   * jeszcze dnia przeglądarki i pokazuje spinner. Widoczny formularz jest sygnałem, że wyspa
   * ożyła i można w nią klikać.
   */
  async expectDiaryVisible() {
    await expect(this.diaryPage).toBeVisible({ timeout: 15000 });
    await expect(this.entryForm).toBeVisible();
    await expect(this.submitButton).toBeEnabled();
  }

  /**
   * Czeka, aż dzień skończy się ładować.
   *
   * Spinner wpisów nie ma własnego testid, ale koniec ładowania jest rozstrzygalny: panel
   * pokazuje wtedy albo pustkę dnia, albo podsumowanie. Bez tego odczyt sumy sprzed dodania
   * wpisów trafiałby w moment, w którym zapytanie jeszcze leci, i dawał fałszywe zero.
   */
  async waitForDaySettled() {
    await expect(this.emptyState.or(this.daySummary)).toBeVisible({ timeout: 15000 });
  }

  async expectDay(day: string) {
    await expect(this.dayInput).toHaveValue(day);
  }

  async addEntry(entry: DiaryEntryData) {
    await this.contentInput.fill(entry.content);
    await this.amountInput.fill(entry.amount ?? "");
    await this.caloriesInput.fill(entry.calories ?? "");

    await this.submitButton.click();

    // Formularz czyści się dopiero po udanym zapisie, więc puste pole opisu jest tu
    // potwierdzeniem, że wpis wylądował w bazie, a nie że klik został zarejestrowany.
    await expect(this.contentInput).toHaveValue("", { timeout: 15000 });
    await expect(this.submitButton).toBeEnabled();
  }

  async expectEntryVisible(content: string) {
    await expect(this.entryContents.filter({ hasText: content })).toBeVisible({ timeout: 15000 });
  }

  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }

  async expectTotal(calories: number) {
    await expect(this.dayTotal).toHaveText(`${calories} kcal`, { timeout: 15000 });
  }

  async expectMissingCount(missing: number) {
    await expect(this.dayMissing).toContainText(`Bez policzonych kalorii: ${missing} z `, { timeout: 15000 });
  }

  /**
   * Suma dnia widoczna w panelu; `0` dla dnia bez wpisów, w którym podsumowanie się nie rysuje.
   *
   * Testy czytają ją przed dodaniem wpisów i liczą przyrost, bo bez route DELETE wiersze
   * z poprzednich przebiegów zostają w bazie pod tym samym dniem-sygnaturą.
   */
  async readTotal(): Promise<number> {
    if (!(await this.dayTotal.isVisible())) return 0;

    const text = (await this.dayTotal.textContent()) ?? "";

    return Number.parseInt(text.replace(/\D/g, ""), 10) || 0;
  }

  /** Liczba wpisów bez kalorii widoczna w panelu; `0`, gdy klauzula o brakach się nie pojawia. */
  async readMissingCount(): Promise<number> {
    if (!(await this.dayMissing.isVisible())) return 0;

    const text = (await this.dayMissing.textContent()) ?? "";
    const match = /Bez policzonych kalorii: (\d+) z /.exec(text);

    return match ? Number.parseInt(match[1], 10) : 0;
  }

  async goToPreviousDay() {
    await this.previousDayButton.click();
  }

  async goToNextDay() {
    await this.nextDayButton.click();
  }

  async goToToday() {
    await this.todayButton.click();
  }

  async expectContentError(errorText: string) {
    await expect(this.contentError).toBeVisible();
    await expect(this.contentError).toHaveText(errorText);
  }

  async expectCaloriesError(errorText: string) {
    await expect(this.caloriesError).toBeVisible();
    await expect(this.caloriesError).toHaveText(errorText);
  }
}
