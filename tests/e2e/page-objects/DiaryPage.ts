import { type Page, type Locator, expect } from "@playwright/test";

export interface DiaryEntryData {
  content: string;
  amount?: string;
  calories?: string;
}

/**
 * Stałe uprzedzenie o wysyłce treści do dostawcy modelu.
 *
 * Kopia `AI_NOTICE` z `src/lib/utils/diary-estimation.ts` - suita E2E nie importuje z `src`,
 * więc zdanie stoi tu dosłownie. Rozjazd wyłapie ta asercja, a nie użytkownik.
 */
const AI_NOTICE_TEXT = "Opis posiłku zostanie wysłany do dostawcy modelu.";

export class DiaryPage {
  readonly page: Page;
  readonly diaryPage: Locator;
  readonly dayNavigator: Locator;
  readonly dayInput: Locator;
  readonly previousDayButton: Locator;
  readonly nextDayButton: Locator;
  readonly todayButton: Locator;
  readonly entryForm: Locator;
  readonly recipeSearchInput: Locator;
  readonly recipeResults: Locator;
  readonly recipeSelected: Locator;
  readonly recipeClearButton: Locator;
  readonly recipePreview: Locator;
  readonly contentInput: Locator;
  readonly contentError: Locator;
  readonly amountInput: Locator;
  readonly amountError: Locator;
  readonly caloriesInput: Locator;
  readonly caloriesError: Locator;
  readonly portionsInput: Locator;
  readonly portionsError: Locator;
  readonly submitButton: Locator;
  readonly submitEstimateButton: Locator;
  readonly formAiNotice: Locator;
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
    this.recipeSearchInput = page.getByTestId("diary-recipe-search-input");
    // Podpowiedź niesie w testid identyfikator przepisu z bazy, którego test nie zna - stąd wzorzec
    // zamiast dosłownej nazwy. Pojedynczy wynik wybiera się z niego filtrem po tytule.
    this.recipeResults = page.getByTestId(/^diary-recipe-result-/);
    this.recipeSelected = page.getByTestId("diary-recipe-selected");
    this.recipeClearButton = page.getByTestId("diary-recipe-clear-button");
    this.recipePreview = page.getByTestId("diary-recipe-preview");
    this.contentInput = page.getByTestId("diary-content-input");
    this.contentError = page.getByTestId("diary-content-error");
    this.amountInput = page.getByTestId("diary-amount-input");
    this.amountError = page.getByTestId("diary-amount-error");
    this.caloriesInput = page.getByTestId("diary-calories-input");
    this.caloriesError = page.getByTestId("diary-calories-error");
    this.portionsInput = page.getByTestId("diary-portions-input");
    this.portionsError = page.getByTestId("diary-portions-error");
    this.submitButton = page.getByTestId("diary-submit-button");
    this.submitEstimateButton = page.getByTestId("diary-submit-estimate-button");
    // `diary-ai-notice` występuje na stronie wiele razy - raz w formularzu i raz przy każdym
    // wpisie z przyciskiem wyceny. Goły `getByTestId` naruszyłby tryb strict, więc lokator jest
    // zawężony do formularza; wersję przy wpisie czyta `entryAiNotice`.
    this.formAiNotice = this.entryForm.getByTestId("diary-ai-notice");
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

  /**
   * Wybiera przepis z podpowiedzi formularza.
   *
   * Podpowiedzi ruszają dopiero od dwóch znaków i po 500 ms opóźnienia, więc na wynik czeka
   * asercja, a nie sztywny `waitForTimeout`: opóźnienie jest stałe, czas odpowiedzi serwera nie.
   * Tytuł musi być unikalny na koncie testowym - filtr po tekście trafiłby inaczej w kilka
   * wyników naraz i Playwright zgłosiłby naruszenie trybu strict.
   */
  async selectRecipe(title: string) {
    await this.recipeSearchInput.fill(title);

    const result = this.recipeResults.filter({ hasText: title });

    await expect(result).toBeVisible({ timeout: 15000 });
    await result.click();

    await expect(this.recipeSelected).toContainText(title);
  }

  /**
   * Formularz po wyborze przepisu: tytuł wstawiony w opis, ilość tekstowa i kalorie zniknęły,
   * a na ich miejscu stoi liczba porcji z domyślną jedynką.
   *
   * Asercje na `toHaveCount(0)`, bo tych dwóch pól nie ma wtedy w drzewie - nie są tylko ukryte.
   */
  async expectRecipeMode(title: string) {
    await expect(this.contentInput).toHaveValue(title);
    await expect(this.amountInput).toHaveCount(0);
    await expect(this.caloriesInput).toHaveCount(0);
    await expect(this.portionsInput).toHaveValue("1");
  }

  async setPortions(portions: string) {
    await this.portionsInput.fill(portions);
  }

  /** Podgląd wartości pod polami - jedyne miejsce, w którym widać wyliczenie przed zapisem. */
  async expectRecipePreview(text: string) {
    await expect(this.recipePreview).toHaveText(text, { timeout: 15000 });
  }

  /**
   * Zapisuje wpis przyciskiem "Dodaj wpis".
   *
   * Ten sam warunek zakończenia co w `addEntry` - wyczyszczony opis - ale bez wypełniania pól
   * ilości tekstowej i kalorii, których przy wybranym przepisie po prostu nie ma w drzewie.
   */
  async submitEntry() {
    await this.submitButton.click();

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

  async expectPortionsError(errorText: string) {
    await expect(this.portionsError).toBeVisible();
    await expect(this.portionsError).toHaveText(errorText);
  }

  /**
   * Wiersz wpisu o podanej treści.
   *
   * Wpis ma `data-testid="diary-entry-<id>"`, ale identyfikatora z bazy test nie zna, więc wiersz
   * wybiera się po treści. Treść musi być unikalna w obrębie dnia - bez route DELETE wpisy
   * z poprzednich przebiegów zostają pod dniem-sygnaturą i trafiłyby w ten sam lokator.
   */
  entryRow(content: string): Locator {
    return this.entryList.locator("li").filter({ hasText: content });
  }

  /** Uprzedzenie o wysyłce treści widoczne przy przyciskach formularza. */
  async expectAiNotice() {
    await expect(this.formAiNotice).toBeVisible();
    await expect(this.formAiNotice).toHaveText(AI_NOTICE_TEXT);
  }

  /** Uprzedzenie o wysyłce treści przy konkretnym wpisie - obok jego przycisku wyceny. */
  async expectEntryAiNotice(content: string) {
    const notice = this.entryRow(content).getByTestId("diary-ai-notice");

    await expect(notice).toBeVisible();
    await expect(notice).toHaveText(AI_NOTICE_TEXT);
  }

  /**
   * Wpis czyta się jako niepoliczony: badge „Nie policzono" i przycisk zlecający wycenę.
   *
   * Żaden krok tej metody nie czeka na odpowiedź modelu - przycisk jest tylko oglądany.
   */
  async expectNotCalculated(content: string) {
    const row = this.entryRow(content);

    await expect(row.getByTestId("diary-entry-calories-missing")).toBeVisible({ timeout: 15000 });
    await expect(row.getByTestId("diary-entry-estimate-button")).toHaveText("Policz kalorie");
  }

  /** Wpisuje liczbę w polu przy wpisie i zapisuje ją; kończy się na potwierdzonej wartości. */
  async setCaloriesInline(content: string, calories: number) {
    const row = this.entryRow(content);

    await row.getByTestId("diary-entry-calories-input").fill(String(calories));
    await row.getByTestId("diary-entry-calories-save").click();

    await expect(row.getByTestId("diary-entry-calories")).toHaveText(`${calories} kcal`, { timeout: 15000 });
  }

  /** Adnotacja o pochodzeniu wartości przy wpisie. */
  async expectEntryOrigin(content: string, originLabel: string) {
    await expect(this.entryRow(content).getByTestId("diary-entry-origin")).toHaveText(originLabel, { timeout: 15000 });
  }

  /**
   * Ilość pokazana pod opisem wpisu.
   *
   * Jeden lokator dla obu ścieżek: wpis z przepisu opisuje ilość liczbą porcji, wpis opisowy -
   * tekstem, a lista rysuje je w tym samym miejscu.
   */
  async expectEntryAmount(content: string, amount: string) {
    await expect(this.entryRow(content).getByTestId("diary-entry-amount")).toHaveText(amount, { timeout: 15000 });
  }

  /** Wartość kaloryczna przy wpisie - ta, którą wiersz dokłada do sumy dnia. */
  async expectEntryCalories(content: string, calories: number) {
    const value = this.entryRow(content).getByTestId("diary-entry-calories");

    await expect(value).toHaveText(`${calories} kcal`, { timeout: 15000 });
  }

  /** Pole na ręczną liczbę przy wpisie przyjmuje pisanie - wpis bez wartości nie jest ślepym zaułkiem. */
  async expectEntryCaloriesEditable(content: string) {
    const field = this.entryRow(content).getByTestId("diary-entry-calories-input");

    await expect(field).toBeEnabled();
  }
}
