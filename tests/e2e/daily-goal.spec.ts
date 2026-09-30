import { test } from "@playwright/test";
import { Application, type LoginCredentials } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

/**
 * Dzień-sygnatura tego scenariusza: z odległej przeszłości, jak w `diary-entry.spec.ts`, ale
 * **osobny**. Asercje paska są dokładne (`450 / 2000 kcal · …`), więc dzień musi startować pusty,
 * a wiersze zostawione pod `2000-01-01` przez nieudany przebieg tamtej suity rozjechałyby sumę.
 * Scenariusz sprząta ten dzień na starcie i po sobie - `deleteDiaryEntriesForDays` kasuje
 * wszystkie wpisy dnia, więc nie może to być żaden prawdziwy dzień konta.
 */
const GOAL_DAY = "2000-01-02";

/** Wszystkie dni, na których pisze scenariusz - lista dla sprzątania wpisów. */
const SCENARIO_DAYS = [GOAL_DAY];

const DAILY_GOAL = 2000;
const FIRST_ENTRY_CALORIES = 450;
const SECOND_ENTRY_CALORIES = 1900;

test.describe("Daily Goal", () => {
  let app: Application;

  // Dane testowe z .env.test
  const testCredentials: LoginCredentials = getTestCredentials();

  test.beforeAll(async () => {
    // Sprawdź czy mamy poprawne dane logowania
    if (!testCredentials.email || !testCredentials.password) {
      throw new Error("Test credentials are not properly configured. Check .env.test file.");
    }
  });

  test.beforeEach(async ({ page }) => {
    app = new Application(page);
  });

  /**
   * Sprzątanie **bez względu na wynik testu** - inaczej niż w `diary-entry.spec.ts`.
   *
   * Cel jest jeden na konto i widać go w każdym dniu dziennika, więc zostawiony po nieudanym
   * przebiegu rysowałby pasek w pozostałych suitach i na prawdziwych dniach konta testowego.
   * Wpisy dnia-sygnatury idą razem z nim, bo następny przebieg i tak zaczyna od pustego dnia.
   *
   * Serwis czyszczenia inicjalizuje się tu od nowa; żądania `page.request` niosą ciasteczka sesji
   * z kontekstu przeglądarki. Jeśli test padł przed zalogowaniem, żądania nie przejdą - stąd
   * ostrzeżenia zamiast wyjątków.
   */
  test.afterEach(async ({ baseURL }) => {
    try {
      app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

      const goalResult = await app.cleanupDailyGoal();
      if (!goalResult.success) {
        console.warn(`⚠️ Nie udało się wyczyścić celu dziennego: ${goalResult.message}`);
      }

      const diaryResult = await app.cleanupDiaryEntries(SCENARIO_DAYS);
      if (!diaryResult.success) {
        console.warn(`⚠️ Nie udało się wyczyścić wpisów dziennika: ${diaryResult.message}`);
      }
    } catch (error) {
      console.warn("⚠️ Błąd podczas czyszczenia celu i wpisów dziennika:", error);
    }
  });

  test("should show progress against the daily goal and hide it once the goal is removed", async ({ baseURL }) => {
    const runId = Date.now();
    const firstEntry = `E2E makaron z sosem ${runId}`;
    const secondEntry = `E2E pizza rodzinna ${runId}`;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Czysty start: cel i wpisy mogły zostać po przebiegu przerwanym przed `afterEach`
    //    (np. zabitym procesie). Oba żądania wymagają sesji, więc dopiero po logowaniu.
    app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);
    await app.cleanupDailyGoal();
    await app.cleanupDiaryEntries(SCENARIO_DAYS);

    // 3. Cel 2000 kcal w profilu
    await app.profilePage.goto();
    await app.profilePage.setGoal(DAILY_GOAL);

    // 4. Dziennik na dniu-sygnaturze - cel dociera z SSR, więc wchodzimy nawigacją po zapisie
    await app.diaryPage.goto(GOAL_DAY);
    await app.diaryPage.expectDay(GOAL_DAY);

    // 5. Pierwszy wpis - pasek mówi, ile zostało
    await app.diaryPage.addEntry({ content: firstEntry, amount: "1 talerz", calories: String(FIRST_ENTRY_CALORIES) });
    await app.diaryPage.expectTotal(FIRST_ENTRY_CALORIES);
    await app.diaryPage.expectGoalText("450 / 2000 kcal · zostało 1550 kcal");

    // 6. Drugi wpis przebija cel - opis mówi o nadwyżce, bez tonu błędu
    await app.diaryPage.addEntry({ content: secondEntry, amount: "1 sztuka", calories: String(SECOND_ENTRY_CALORIES) });
    await app.diaryPage.expectTotal(FIRST_ENTRY_CALORIES + SECOND_ENTRY_CALORIES);
    await app.diaryPage.expectGoalText("2350 / 2000 kcal · 350 kcal ponad cel");

    // 7. Usunięcie celu w profilu
    await app.profilePage.goto();
    await app.profilePage.clearGoal();

    // 8. Ten sam dzień, wciąż z wpisami: suma stoi, a paska nie ma - bo nie ma celu, nie wpisów
    await app.diaryPage.goto(GOAL_DAY);
    await app.diaryPage.expectDay(GOAL_DAY);
    await app.diaryPage.expectTotal(FIRST_ENTRY_CALORIES + SECOND_ENTRY_CALORIES);
    await app.diaryPage.expectNoGoalProgress();
  });
});
