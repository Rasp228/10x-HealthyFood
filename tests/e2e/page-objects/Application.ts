import { type Page } from "@playwright/test";
import { LoginPage } from "./LoginPage";
import { HomePage } from "./HomePage";
import { RecipeFormPage } from "./RecipeFormPage";

export class Application {
  readonly page: Page;
  readonly loginPage: LoginPage;
  readonly homePage: HomePage;
  readonly recipeFormPage: RecipeFormPage;

  constructor(page: Page) {
    this.page = page;
    this.loginPage = new LoginPage(page);
    this.homePage = new HomePage(page);
    this.recipeFormPage = new RecipeFormPage(page);
  }

  // Metoda do czyszczenia stanu między testami
  async cleanup() {
    // Jeśli jakieś modale są otwarte, zamknij je
    try {
      await this.recipeFormPage.closeModal();
    } catch {
      // Modal może nie być otwarty
    }

    // Wyczyść wyszukiwanie jeśli jest aktywne
    try {
      await this.homePage.clearSearch();
    } catch {
      // Przycisk może nie być widoczny
    }
  }
}
