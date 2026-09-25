import { expect, test } from "@playwright/test";
import { Application, type LoginCredentials, type RecipeData } from "./page-objects";
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

/** Kalorie na porcję zadeklarowane w bloku poniżej - jedyna liczba, z której liczą się oczekiwania. */
const CALORIES_PER_PORTION = 250;

/**
 * Przepis z blokiem odżywczym w formie, którą parser rozpoznaje: nagłówek sam deklaruje, że
 * opisuje **porcję**. Blok bez tego słowa jest dla parsera nieobecny, więc test nie może go
 * skrócić do samego "Wartości odżywcze:".
 */
const RECIPE_CONTENT_WITH_NUTRITION = `Składniki:
- 100 g płatków owsianych
- 200 ml mleka

Przygotowanie:
1. Zagotuj mleko
2. Wsyp płatki i gotuj 5 minut

Wartości odżywcze (na porcję):
Kalorie: ${CALORIES_PER_PORTION} kcal`;

/** Ten sam przepis bez bloku - wpis z niego ma prawo zostać niepoliczony. */
const RECIPE_CONTENT_WITHOUT_NUTRITION = `Składniki:
- garść orzechów włoskich

Przygotowanie:
1. Wysyp do miseczki`;

test.describe("Diary Entry", () => {
  let app: Application;
  let testPassed = false;

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
    testPassed = false; // Reset flag before each test
  });

  /**
   * Czyszczenie danych testowych, skopiowane z `recipe-management.spec.ts`.
   *
   * Scenariusze z przepisem tworzą go przez UI i bez tego hooka zostawiałyby po każdym przebiegu
   * kolejny wiersz na koncie testowym. Wpisów dziennika nadal nie ma czym posprzątać - route
   * DELETE przychodzi dopiero z S-05 - więc jedyne, co tu można oddać, to przepisy.
   *
   * Bramka jest podwójna: status Playwrighta i własna flaga. Po nieudanym teście przepis zostaje
   * na koncie do obejrzenia, a scenariusze, które przepisu nie tworzą, w ogóle nie wołają
   * czyszczenia - `deleteAllTestUserRecipes` kasuje **wszystkie** przepisy konta, nie tylko te
   * z przebiegu.
   *
   * `test.info()` zamiast drugiego argumentu hooka: ten hook nie potrzebuje żadnej fikstury.
   */
  test.afterEach(async () => {
    if (!testPassed || test.info().status !== "passed") {
      return;
    }

    try {
      const cleanupResult = await app.cleanupTestData();
      if (!cleanupResult.success) {
        console.warn(`⚠️ Nie udało się wyczyścić danych testowych: ${cleanupResult.message}`);
      }
    } catch (error) {
      console.warn("⚠️ Błąd podczas czyszczenia danych testowych:", error);
    }
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

  test("should offer AI estimation and accept a manually typed value instead", async () => {
    // Scenariusz celowo nie klika w „Policz kalorie": suita ma zostać deterministyczna i nie
    // płacić za wywołania modelu w CI. Sprawdzamy powierzchnię wyceny i ścieżkę ręczną.

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Ten sam dzień-sygnatura co wyżej - wiersze parkują w dniu, którego nikt nie otwiera
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const totalBefore = await app.diaryPage.readTotal();
    const missingBefore = await app.diaryPage.readMissingCount();

    const entryToCount = `E2E kanapka z serem ${Date.now()}`;

    // 3. Uprzedzenie o wysyłce treści jest widoczne przy przyciskach formularza
    await app.diaryPage.expectAiNotice();

    // 4. Wpis bez wartości
    await app.diaryPage.addEntry({
      content: entryToCount,
      amount: "2 kromki",
    });

    // 5. Wpis czyta się jako niepoliczony i oferuje wycenę, a uprzedzenie stoi też przy nim
    await app.diaryPage.expectNotCalculated(entryToCount);
    await app.diaryPage.expectEntryAiNotice(entryToCount);
    await app.diaryPage.expectMissingCount(missingBefore + 1);

    // 6. Liczba wpisana ręcznie w polu przy wpisie
    await app.diaryPage.setCaloriesInline(entryToCount, 260);
    await app.diaryPage.expectEntryOrigin(entryToCount, "wpisane ręcznie");

    // 7. Suma dnia rośnie o wpisaną liczbę, a licznik braków wraca do stanu sprzed wpisu
    await app.diaryPage.expectTotal(totalBefore + 260);
    expect(await app.diaryPage.readMissingCount()).toBe(missingBefore);
  });

  test("should count an entry created from a recipe by the number of portions", async ({ baseURL }) => {
    // Przepis powstaje w trakcie testu, przez tę samą powierzchnię co w `recipe-management`:
    // suita nie może zakładać, że konto testowe ma akurat przepis z blokiem odżywczym.
    const runId = Date.now();
    const recipe: RecipeData = {
      title: `E2E Owsianka z wartościami ${runId}`,
      content: RECIPE_CONTENT_WITH_NUTRITION,
      additionalParams: "e2e-test",
    };
    const portions = 2;
    const expectedCalories = CALORIES_PER_PORTION * portions;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Inicjalizuj serwis czyszczenia po zalogowaniu - ten scenariusz zostawia po sobie przepis
    app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

    // 3. Przepis z rozpoznawanym blokiem odżywczym
    await app.homePage.clickAddRecipe();
    await app.recipeFormPage.expectAddRecipeModal();
    await app.recipeFormPage.fillRecipeForm(recipe);
    await app.recipeFormPage.submitForm();
    await app.recipeFormPage.expectModalClosed();

    // 4. Dzień-sygnatura, ten sam co w pozostałych scenariuszach
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    // 5. Punkt odniesienia - wiersze z poprzednich przebiegów zostają pod tym dniem
    const totalBefore = await app.diaryPage.readTotal();

    // 6. Wybór przepisu: tytuł ląduje w opisie, ilość tekstowa i kalorie ustępują miejsca porcjom
    await app.diaryPage.selectRecipe(recipe.title);
    await app.diaryPage.expectRecipeMode(recipe.title);

    // 7. Dwie porcje - podgląd obiecuje wartość jeszcze przed zapisem
    await app.diaryPage.setPortions(String(portions));
    await app.diaryPage.expectRecipePreview(`≈ ${expectedCalories} kcal — z przepisu, ${portions} porcje`);

    // 8. Zapis
    await app.diaryPage.submitEntry();

    // 9. Wiersz dnia dotrzymuje obietnicy podglądu, razem z pochodzeniem wartości
    await app.diaryPage.expectEntryVisible(recipe.title);
    await app.diaryPage.expectEntryAmount(recipe.title, `${portions} porcje`);
    await app.diaryPage.expectEntryOrigin(recipe.title, "z przepisu");
    await app.diaryPage.expectEntryCalories(recipe.title, expectedCalories);

    // 10. Suma dnia rośnie dokładnie o wyliczoną wartość
    await app.diaryPage.expectTotal(totalBefore + expectedCalories);

    // 11. Oznacz test jako zaliczony (umożliwia czyszczenie danych)
    testPassed = true;
  });

  test("should leave an entry from a recipe without nutrition uncounted", async ({ baseURL }) => {
    const runId = Date.now();
    const recipe: RecipeData = {
      title: `E2E Orzechy bez wartości ${runId}`,
      content: RECIPE_CONTENT_WITHOUT_NUTRITION,
      additionalParams: "e2e-test",
    };

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Inicjalizuj serwis czyszczenia po zalogowaniu
    app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

    // 3. Przepis bez bloku odżywczego
    await app.homePage.clickAddRecipe();
    await app.recipeFormPage.expectAddRecipeModal();
    await app.recipeFormPage.fillRecipeForm(recipe);
    await app.recipeFormPage.submitForm();
    await app.recipeFormPage.expectModalClosed();

    // 4. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const missingBefore = await app.diaryPage.readMissingCount();

    // 5. Podgląd przyznaje się do braku i kieruje po zapisie, a nie do pola w formularzu
    await app.diaryPage.selectRecipe(recipe.title);
    await app.diaryPage.expectRecipeMode(recipe.title);
    await app.diaryPage.expectRecipePreview(
      "Ten przepis nie podaje wartości odżywczych na porcję — kalorie ustalisz po zapisaniu wpisu"
    );

    // 6. Zapis przy domyślnej jednej porcji
    await app.diaryPage.submitEntry();

    // 7. Wpis jest niepoliczony, ale nie ślepy: pole na własną liczbę stoi otwarte
    await app.diaryPage.expectEntryVisible(recipe.title);
    await app.diaryPage.expectEntryAmount(recipe.title, "1 porcja");
    await app.diaryPage.expectNotCalculated(recipe.title);
    await app.diaryPage.expectEntryCaloriesEditable(recipe.title);
    await app.diaryPage.expectMissingCount(missingBefore + 1);

    // 8. Oznacz test jako zaliczony (umożliwia czyszczenie danych)
    testPassed = true;
  });
});
