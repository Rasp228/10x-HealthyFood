import { test } from "@playwright/test";
import { Application, type LoginCredentials } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

/**
 * Dzień-sygnatura: data z odległej przeszłości, której żaden człowiek nie otworzy w dzienniku.
 *
 * Nie ma jeszcze route DELETE dla wpisów dziennika, więc `CleanupService` nie ma czego zawołać
 * i wiersze z tego przebiegu zostają w bazie. Zebrane pod jednym sztucznym dniem nie zaśmiecają
 * żadnego prawdziwego dnia użytkownika, a data z przeszłości spełnia przy tym regułę panelu,
 * który nie pozwala pisać w przyszłość.
 */
const SIGNATURE_DAY = "2000-01-01";

test.describe("Diary Entry", () => {
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

  test("should add entries with and without calories and summarize the day honestly @smoke", async () => {
    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Wejście od razu na dzień-sygnaturę - dzień podróżuje w query stringu
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    // 3. Punkt odniesienia. Wiersze z poprzednich przebiegów zostają w bazie pod tym samym
    //    dniem, więc asercje dotyczą przyrostu, a nie wartości bezwzględnych.
    const totalBefore = await app.diaryPage.readTotal();
    const missingBefore = await app.diaryPage.readMissingCount();

    // Treść musi być unikalna w obrębie dnia, inaczej wpis z poprzedniego przebiegu trafiłby
    // w ten sam lokator i Playwright zgłosiłby naruszenie trybu strict.
    const runId = Date.now();
    const entryWithCalories = `E2E owsianka z bananem ${runId}`;
    const entryWithoutCalories = `E2E garść orzechów ${runId}`;

    // 4. Wpis z wartością
    await app.diaryPage.addEntry({
      content: entryWithCalories,
      amount: "1 talerz",
      calories: "450",
    });

    // 5. Wpis bez wartości - pole kalorii zostaje puste
    await app.diaryPage.addEntry({
      content: entryWithoutCalories,
      amount: "1 garść",
    });

    // 6. Oba wpisy są na liście dnia
    await app.diaryPage.expectEntryVisible(entryWithCalories);
    await app.diaryPage.expectEntryVisible(entryWithoutCalories);

    // 7. Suma liczy tylko wpis z wartością, a panel przyznaje się do jednego braku
    await app.diaryPage.expectTotal(totalBefore + 450);
    await app.diaryPage.expectMissingCount(missingBefore + 1);
  });
});
