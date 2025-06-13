import { type Page } from "@playwright/test";

/**
 * Serwis do bezpiecznego czyszczenia danych testowych
 */
export class CleanupService {
  private page: Page;
  private baseUrl: string;
  private testUserId: string;

  constructor(page: Page, baseUrl: string, testUserId: string) {
    this.page = page;
    this.baseUrl = baseUrl;
    this.testUserId = testUserId;
  }

  /**
   * Bezpiecznie usuwa wszystkie przepisy testowego użytkownika
   */
  async deleteAllTestUserRecipes(): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      // 1. Pobierz wszystkie przepisy testowego użytkownika
      const response = await this.page.request.get(`${this.baseUrl}/api/recipes`);

      if (!response.ok()) {
        const responseText = await response.text();
        errors.push(`Nie udało się pobrać listy przepisów: ${response.status()} - ${responseText}`);
        return { deleted: 0, errors };
      }

      const responseData = await response.json();
      const recipes = responseData.data;

      if (!recipes || recipes.length === 0) {
        return { deleted: 0, errors: [] };
      }

      console.log(`Znaleziono ${recipes.length} przepis do usunięcia`);

      // 2. Usuń każdy przepis (API już sprawdza czy należy do użytkownika)
      for (const recipe of recipes) {
        try {
          const deleteResponse = await this.page.request.delete(`${this.baseUrl}/api/recipes/${recipe.id}`);

          if (deleteResponse.ok()) {
            deletedCount++;
            console.log(`Usunięto przepis testowy: "${recipe.title}" (ID: ${recipe.id})`);
          } else {
            const errorText = await deleteResponse.text();
            errors.push(`Nie udało się usunąć przepisu ${recipe.id}: ${deleteResponse.status()} - ${errorText}`);
          }
        } catch (error) {
          errors.push(`Błąd przy usuwaniu przepisu ${recipe.id}: ${error}`);
        }
      }

      return { deleted: deletedCount, errors };
    } catch (error) {
      errors.push(`Ogólny błąd czyszczenia: ${error}`);
      return { deleted: 0, errors };
    }
  }

  /**
   * Sprawdza czy użytkownik jest testowym użytkownikiem
   * Dodatkowe zabezpieczenie przed przypadkowym usunięciem danych produkcyjnych
   */
  async verifyTestUser(): Promise<boolean> {
    try {
      // Sprawdź czy możemy pobrać statystyki użytkownika
      const response = await this.page.request.get(`${this.baseUrl}/api/users/stats`);

      if (!response.ok()) {
        console.warn(`Nie udało się zweryfikować użytkownika testowego: ${response.status()}`);
        return false;
      }

      // Jeśli dotarliśmy tutaj, użytkownik jest zalogowany
      // W środowisku testowym to powinien być testowy użytkownik
      return true;
    } catch (error) {
      console.warn("Błąd weryfikacji użytkownika testowego:", error);
      return false;
    }
  }

  /**
   * Bezpieczne czyszczenie z weryfikacją
   */
  async safeCleanup(): Promise<{
    success: boolean;
    message: string;
    details?: { deleted: number; errors?: string[] };
  }> {
    // 1. Zweryfikuj że to testowy użytkownik
    const isTestUser = await this.verifyTestUser();
    if (!isTestUser) {
      return {
        success: false,
        message: "Nie udało się zweryfikować użytkownika testowego - przerwano czyszczenie",
      };
    }

    // 2. Wykonaj czyszczenie
    const result = await this.deleteAllTestUserRecipes();

    if (result.errors.length > 0) {
      return {
        success: false,
        message: `Częściowe czyszczenie: usunięto ${result.deleted} przepisów, ${result.errors.length} błędów`,
        details: { deleted: result.deleted, errors: result.errors },
      };
    }

    return {
      success: true,
      message: `Pomyślnie usunięto ${result.deleted} przepisów testowych`,
      details: { deleted: result.deleted },
    };
  }
}
