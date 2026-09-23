import { type Page } from "@playwright/test";
import { LoginPage } from "./LoginPage";
import { HomePage } from "./HomePage";
import { RecipeFormPage } from "./RecipeFormPage";
import { DiaryPage } from "./DiaryPage";
import { CleanupService } from "../services/cleanup.service";

export class Application {
  readonly page: Page;
  readonly loginPage: LoginPage;
  readonly homePage: HomePage;
  readonly recipeFormPage: RecipeFormPage;
  readonly diaryPage: DiaryPage;
  private cleanupService?: CleanupService;

  constructor(page: Page) {
    this.page = page;
    this.loginPage = new LoginPage(page);
    this.homePage = new HomePage(page);
    this.recipeFormPage = new RecipeFormPage(page);
    this.diaryPage = new DiaryPage(page);
  }

  // Inicjalizuje serwis czyszczenia po zalogowaniu
  initializeCleanup(baseUrl: string, testUserId: string) {
    this.cleanupService = new CleanupService(this.page, baseUrl, testUserId);
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

  // Bezpieczne czyszczenie danych testowych (tylko po udanym teście)
  async cleanupTestData(): Promise<{ success: boolean; message: string }> {
    if (!this.cleanupService) {
      return {
        success: false,
        message: "Serwis czyszczenia nie został zainicjalizowany",
      };
    }

    try {
      const result = await this.cleanupService.safeCleanup();
      console.log(`🧹 Czyszczenie danych: ${result.message}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";
      console.error("❌ Błąd podczas czyszczenia danych:", errorMessage);
      return {
        success: false,
        message: `Błąd czyszczenia: ${errorMessage}`,
      };
    }
  }
}
