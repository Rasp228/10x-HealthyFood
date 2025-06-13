import { test } from "@playwright/test";
import { Application, type RecipeData, type LoginCredentials } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

test.describe("Recipe Management", () => {
  let app: Application;
  let testPassed = false;

  // Dane testowe z .env.test
  const testCredentials: LoginCredentials = getTestCredentials();

  const sampleRecipe: RecipeData = {
    title: "Testowy Przepis E2E",
    content: `Składniki:
- 2 jajka
- 200g mąki
- 1 szklanka mleka

Przygotowanie:
1. Wymieszaj składniki
2. Usmaż na patelni
3. Podawaj ciepłe`,
    additionalParams: "e2e-test, śniadanie, łatwy, wegetariański",
  };

  // Hook uruchamiany przed wszystkimi testami
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  test.afterEach(async ({ page }, testInfo) => {
    // Podstawowe czyszczenie UI
    await app.cleanup();

    // Czyszczenie danych testowych TYLKO jeśli test się powiódł
    if (testInfo.status === "passed" && testPassed) {
      try {
        const cleanupResult = await app.cleanupTestData();
        if (!cleanupResult.success) {
          console.warn(`⚠️ Nie udało się wyczyścić danych testowych: ${cleanupResult.message}`);
        }
      } catch (error) {
        console.warn("⚠️ Błąd podczas czyszczenia danych testowych:", error);
      }
    } else if (testInfo.status !== "passed") {
      console.log("🔍 Test nie powiódł się - dane testowe zostają zachowane do debugowania");
    }
  });

  test("should complete full recipe addition flow @smoke", async ({ baseURL }) => {
    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Inicjalizuj serwis czyszczenia po zalogowaniu
    app.initializeCleanup(baseURL || "http://localhost:3000", testCredentials.userId);

    // 3. Kliknięcie dodaj przepis
    await app.homePage.clickAddRecipe();
    await app.recipeFormPage.expectAddRecipeModal();

    // 4. Wypełnienie modala
    await app.recipeFormPage.fillRecipeForm(sampleRecipe);

    // 5. Dodanie przepisu
    await app.recipeFormPage.submitForm();
    await app.recipeFormPage.expectModalClosed();

    // 6. Sprawdź czy przepis pojawił się na liście
    await app.homePage.expectRecipesGridVisible();

    // 7. Oznacz test jako zaliczony (umożliwia czyszczenie danych)
    testPassed = true;
  });
});
