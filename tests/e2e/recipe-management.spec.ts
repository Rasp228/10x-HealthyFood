import { test } from "@playwright/test";
import { Application, type RecipeData, type LoginCredentials } from "./page-objects";
import { getTestCredentials } from "./config/test-data";

test.describe("Recipe Management", () => {
  let app: Application;

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
  });

  test.afterEach(async () => {
    await app.cleanup();
  });

  test("should complete full recipe addition flow @smoke", async () => {
    // 1. Logowanie
    await app.loginPage.goto();
    await app.loginPage.login(testCredentials.email, testCredentials.password);
    await app.loginPage.expectSuccessfulLogin();

    // 2. Kliknięcie dodaj przepis
    await app.homePage.clickAddRecipe();
    await app.recipeFormPage.expectAddRecipeModal();

    // 3. Wypełnienie modala
    await app.recipeFormPage.fillRecipeForm(sampleRecipe);

    // 4. Dodanie przepisu
    await app.recipeFormPage.submitForm();
    await app.recipeFormPage.expectModalClosed();

    // Sprawdź czy przepis pojawił się na liście
    await app.homePage.expectRecipesGridVisible();
  });
});
