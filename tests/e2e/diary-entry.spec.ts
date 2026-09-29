import { expect, test } from "@playwright/test";
import { Application, type LoginCredentials, type RecipeData } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

/**
 * Dzień-sygnatura: data z odległej przeszłości, której żaden człowiek nie otworzy w dzienniku.
 *
 * Od S-05 wpisy da się usuwać, więc `afterEach` sprząta ten dzień po każdym zdanym teście. Dzień
 * zostaje sztuczny z dwóch powodów: `deleteDiaryEntriesForDays` kasuje **wszystkie** wpisy dnia,
 * więc nie może trafić w prawdziwy dzień konta, a test nieudany zostawia swoje wiersze do
 * obejrzenia - pod dniem, którego nikt nie otwiera. Data z przeszłości spełnia przy tym regułę
 * panelu, który nie pozwala pisać w przyszłość.
 */
const SIGNATURE_DAY = "2000-01-01";

/**
 * Dzień, na który scenariusz zmiany dnia przenosi wpis: dzień **przed** sygnaturą, bo pole dnia
 * w modalu edycji nie przyjmuje przyszłości, a "przyszłość" liczy się od dziś, nie od sygnatury.
 * Sprzątany razem z `SIGNATURE_DAY`.
 */
const MOVE_TARGET_DAY = "1999-12-31";

/** Wszystkie dni, na których piszą scenariusze - lista dla sprzątania wpisów. */
const SCENARIO_DAYS = [SIGNATURE_DAY, MOVE_TARGET_DAY];

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
   * Dwa kroki, w tej kolejności:
   * 1. Wpisy dziennika z dni scenariuszy - po każdym zdanym teście, bo każdy scenariusz pisze
   *    w dzienniku. Idą pierwsze: klucz obcy wpisu na przepis ma `on delete set null`, więc
   *    usunięcie przepisu przed wpisem zostawiłoby wiersz-sierotę.
   * 2. Przepisy - tylko po scenariuszach, które je tworzą. Bramka jest podwójna: status
   *    Playwrighta i własna flaga, bo `deleteAllTestUserRecipes` kasuje **wszystkie** przepisy
   *    konta, nie tylko te z przebiegu.
   *
   * Po nieudanym teście nie sprząta się nic - wpisy i przepis zostają na koncie do obejrzenia.
   *
   * Serwis czyszczenia inicjalizuje się tu od nowa, bo scenariusze bez przepisu go nie zakładają;
   * żądania `page.request` i tak niosą ciasteczka sesji z kontekstu przeglądarki.
   */
  test.afterEach(async ({ baseURL }) => {
    if (test.info().status !== "passed") {
      return;
    }

    try {
      app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

      const diaryResult = await app.cleanupDiaryEntries(SCENARIO_DAYS);
      if (!diaryResult.success) {
        console.warn(`⚠️ Nie udało się wyczyścić wpisów dziennika: ${diaryResult.message}`);
      }
    } catch (error) {
      console.warn("⚠️ Błąd podczas czyszczenia wpisów dziennika:", error);
    }

    if (!testPassed) {
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

  test("should offer estimation from the recipe content for an uncounted entry with portions", async ({ baseURL }) => {
    // Scenariusz celowo nie klika w „Policz kalorie" - precedens z pozostałych: suita zostaje
    // deterministyczna i nie dotyka OpenRoutera. Sprawdzamy powierzchnię wyceny z przepisu:
    // wpis z liczbą porcji ląduje w stanie „Nie policzono", a zdanie przy nim mówi o treści
    // przepisu, bo to ona opuści produkt po kliknięciu.
    const runId = Date.now();
    const recipe: RecipeData = {
      title: `E2E Orzechy na porcje ${runId}`,
      content: RECIPE_CONTENT_WITHOUT_NUTRITION,
      additionalParams: "e2e-test",
    };
    const portions = 2;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Inicjalizuj serwis czyszczenia po zalogowaniu
    app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

    // 3. Przepis bez bloku odżywczego - jedyny, dla którego wycena z treści ma sens
    await app.homePage.clickAddRecipe();
    await app.recipeFormPage.expectAddRecipeModal();
    await app.recipeFormPage.fillRecipeForm(recipe);
    await app.recipeFormPage.submitForm();
    await app.recipeFormPage.expectModalClosed();

    // 4. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const missingBefore = await app.diaryPage.readMissingCount();

    // 5. Bez wybranego przepisu formularz uprzedza o samym opisie posiłku
    await app.diaryPage.expectAiNotice();

    // 6. Po wybraniu przepisu zdanie się zmienia - wychodzi treść przepisu, nie sam opis
    await app.diaryPage.selectRecipe(recipe.title);
    await app.diaryPage.expectRecipeMode(recipe.title);
    await app.diaryPage.expectRecipeAiNotice();

    // 7. Dwie porcje; podgląd przyznaje się do braku wartości i kieruje na wycenę po zapisie
    await app.diaryPage.setPortions(String(portions));
    await app.diaryPage.expectRecipePreview(
      "Ten przepis nie podaje wartości odżywczych na porcję — kalorie ustalisz po zapisaniu wpisu"
    );

    // 8. Zapis
    await app.diaryPage.submitEntry();

    // 9. Wiersz niesie liczbę porcji i czeka na wycenę, a zdanie przy nim mówi o treści przepisu
    await app.diaryPage.expectEntryVisible(recipe.title);
    await app.diaryPage.expectEntryAmount(recipe.title, `${portions} porcje`);
    await app.diaryPage.expectNotCalculated(recipe.title);
    await app.diaryPage.expectEntryRecipeAiNotice(recipe.title);
    await app.diaryPage.expectMissingCount(missingBefore + 1);

    // 10. Oznacz test jako zaliczony (umożliwia czyszczenie danych)
    testPassed = true;
  });

  test("should keep the value and its origin when only the content is edited", async () => {
    const runId = Date.now();
    // Nowa treść nie zawiera starej - `entryRow` filtruje po fragmencie tekstu.
    const originalContent = `E2E jajecznica ${runId}`;
    const editedContent = `E2E omlet z pomidorem ${runId}`;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const totalBefore = await app.diaryPage.readTotal();

    // 3. Wpis z liczbą wpisaną ręcznie
    await app.diaryPage.addEntry({ content: originalContent, amount: "3 jajka", calories: "320" });
    await app.diaryPage.expectEntryOrigin(originalContent, "wpisane ręcznie");

    // 4. Pusty opis modal odrzuca przy polu i zostaje otwarty - nic nie jedzie do serwera
    await app.diaryPage.editEntry(originalContent, { content: "" });
    await app.diaryPage.editSaveButton.click();
    await app.diaryPage.expectEditError("content", "Opis posiłku jest wymagany");

    // 5. Zmiana samej treści i „Zapisz" - liczba w modalu zostaje zasiana z wiersza i nie jedzie
    await app.diaryPage.editInput("content").fill(editedContent);
    await app.diaryPage.saveEdit();
    await app.diaryPage.expectToast("Wpis został zapisany");

    // 6. Wiersz ma nową treść, a wartość i pochodzenie stoją
    await app.diaryPage.expectEntryVisible(editedContent);
    await app.diaryPage.expectEntryAbsent(originalContent);
    await app.diaryPage.expectEntryCalories(editedContent, 320);
    await app.diaryPage.expectEntryOrigin(editedContent, "wpisane ręcznie");
    await app.diaryPage.expectTotal(totalBefore + 320);
  });

  test("should recalculate a recipe entry from the recipe after changing portions", async ({ baseURL }) => {
    // Przepis z blokiem wartości: przeliczenie rozstrzyga parser po stronie serwera, w tym samym
    // zapisie, więc wiersz nie trafia do kolejki wyceny i model nie jest wołany.
    const runId = Date.now();
    const recipe: RecipeData = {
      title: `E2E Owsianka do przeliczenia ${runId}`,
      content: RECIPE_CONTENT_WITH_NUTRITION,
      additionalParams: "e2e-test",
    };
    const newPortions = 2;
    const expectedCalories = CALORIES_PER_PORTION * newPortions;

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

    // 4. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const totalBefore = await app.diaryPage.readTotal();

    // 5. Wpis z przepisu przy domyślnej jednej porcji
    await app.diaryPage.selectRecipe(recipe.title);
    await app.diaryPage.expectRecipeMode(recipe.title);
    await app.diaryPage.submitEntry();
    await app.diaryPage.expectEntryCalories(recipe.title, CALORIES_PER_PORTION);

    // 6. Dwie porcje i „Zapisz i przelicz"
    await app.diaryPage.editEntry(recipe.title, { portions: String(newPortions) });
    await app.diaryPage.saveEditAndRecalculate();
    await app.diaryPage.expectToast("Wpis został zapisany");

    // 7. Nowa wartość z przepisu - liczona od porcji po edycji
    await app.diaryPage.expectEntryAmount(recipe.title, `${newPortions} porcje`);
    await app.diaryPage.expectEntryCalories(recipe.title, expectedCalories);
    await app.diaryPage.expectEntryOrigin(recipe.title, "z przepisu");
    await app.diaryPage.expectTotal(totalBefore + expectedCalories);

    // 8. Oznacz test jako zaliczony (umożliwia czyszczenie przepisu)
    testPassed = true;
  });

  test("should mark an entry as not calculated and change the day total when its value is cleared", async () => {
    const runId = Date.now();
    const content = `E2E kotlet schabowy ${runId}`;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const totalBefore = await app.diaryPage.readTotal();
    const missingBefore = await app.diaryPage.readMissingCount();

    // 3. Wpis z wartością - suma rośnie
    await app.diaryPage.addEntry({ content, amount: "1 sztuka", calories: "540" });
    await app.diaryPage.expectTotal(totalBefore + 540);

    // 4. Wyczyszczenie liczby i „Zapisz" - bez przeliczenia, więc wiersz nie idzie do kolejki
    await app.diaryPage.editEntry(content, { calories: "" });
    await app.diaryPage.saveEdit();
    await app.diaryPage.expectToast("Wpis został zapisany");

    // 5. Wpis czyta się jako niepoliczony, suma wraca, a licznik braków rośnie o jeden
    await app.diaryPage.expectNotCalculated(content);
    await app.diaryPage.expectTotal(totalBefore);
    await app.diaryPage.expectMissingCount(missingBefore + 1);
  });

  test("should move an entry to another day and say where it went", async () => {
    const runId = Date.now();
    const content = `E2E zupa pomidorowa ${runId}`;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    // 3. Wpis do przeniesienia
    await app.diaryPage.addEntry({ content, amount: "1 talerz", calories: "180" });
    await app.diaryPage.expectEntryVisible(content);

    // 4. Dzień wcześniejszy - zapis przechodzi, wpis znika z bieżącej listy, a toast mówi, dokąd
    //    trafił. Widok zostaje na dniu, z którego wpis wyszedł.
    await app.diaryPage.editEntry(content, { date: MOVE_TARGET_DAY });
    await app.diaryPage.saveEdit();
    await app.diaryPage.expectToast(`Wpis przeniesiono na ${MOVE_TARGET_DAY}`);
    await app.diaryPage.expectDay(SIGNATURE_DAY);
    await app.diaryPage.expectEntryAbsent(content);

    // 5. Wpis czeka na nowym dniu, z tą samą wartością
    await app.diaryPage.goto(MOVE_TARGET_DAY);
    await app.diaryPage.expectDay(MOVE_TARGET_DAY);
    await app.diaryPage.expectEntryVisible(content);
    await app.diaryPage.expectEntryCalories(content, 180);
  });

  test("should delete an entry only after confirmation", async () => {
    const runId = Date.now();
    const content = `E2E pączek z różą ${runId}`;

    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Dzień-sygnatura
    await app.diaryPage.goto(SIGNATURE_DAY);
    await app.diaryPage.expectDay(SIGNATURE_DAY);

    const totalBefore = await app.diaryPage.readTotal();

    // 3. Wpis do usunięcia
    await app.diaryPage.addEntry({ content, amount: "1 sztuka", calories: "290" });
    await app.diaryPage.expectTotal(totalBefore + 290);

    // 4. „Anuluj" w dialogu zostawia wpis i sumę
    await app.diaryPage.cancelDelete(content);
    await app.diaryPage.expectEntryVisible(content);
    await app.diaryPage.expectTotal(totalBefore + 290);

    // 5. Potwierdzenie usuwa wpis, a suma dnia wraca do stanu sprzed niego
    await app.diaryPage.deleteEntry(content);
    await app.diaryPage.expectToast("Wpis został usunięty");
    await app.diaryPage.expectEntryAbsent(content);

    if (totalBefore > 0) {
      await app.diaryPage.expectTotal(totalBefore);
    } else {
      // Dzień bez innych policzonych wpisów: po usunięciu podsumowanie albo pokazuje zero, albo
      // ustępuje pustemu dniowi - `readTotal` czyta oba przypadki jako 0. Dzień jest już ustalony,
      // bo `deleteEntry` kończy się na świeżej liście.
      expect(await app.diaryPage.readTotal()).toBe(0);
    }
  });
});
