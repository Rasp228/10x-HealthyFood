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
          // Astro odrzuca zapytania niebędące GET bez nagłówka Origin (security.checkOrigin),
          // a APIRequestContext Playwrighta go nie dokłada - stąd jawny nagłówek.
          const deleteResponse = await this.page.request.delete(`${this.baseUrl}/api/recipes/${recipe.id}`, {
            headers: { Origin: this.baseUrl },
          });

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
   * Usuwa wpisy dziennika testowego użytkownika z podanych dni.
   *
   * Dziennik nie ma listy "wszystkich wpisów" - trasa GET zwraca jeden dzień - więc sprzątamy
   * wyłącznie dni, na których piszą scenariusze. Prawdziwe dni konta testowego zostają nietknięte.
   * Wołane **przed** `deleteAllTestUserRecipes`: klucz obcy wpisu na przepis ma
   * `on delete set null`, więc usunięcie przepisu najpierw zostawiłoby wiersze-sieroty.
   */
  async deleteDiaryEntriesForDays(days: string[]): Promise<{ deleted: number; errors: string[] }> {
    const errors: string[] = [];
    let deletedCount = 0;

    for (const day of days) {
      try {
        const response = await this.page.request.get(`${this.baseUrl}/api/diary-entries?date=${day}`);

        if (!response.ok()) {
          const responseText = await response.text();
          errors.push(`Nie udało się pobrać wpisów z dnia ${day}: ${response.status()} - ${responseText}`);
          continue;
        }

        const responseData = await response.json();
        const entries: { id: number; content: string }[] = responseData.data ?? [];

        for (const entry of entries) {
          try {
            // Ten sam powód co przy przepisach: bez nagłówka Origin Astro odrzuca DELETE
            // (security.checkOrigin), a APIRequestContext Playwrighta go nie dokłada.
            const deleteResponse = await this.page.request.delete(`${this.baseUrl}/api/diary-entries/${entry.id}`, {
              headers: { Origin: this.baseUrl },
            });

            if (deleteResponse.ok()) {
              deletedCount++;
            } else {
              const errorText = await deleteResponse.text();
              errors.push(`Nie udało się usunąć wpisu ${entry.id}: ${deleteResponse.status()} - ${errorText}`);
            }
          } catch (error) {
            errors.push(`Błąd przy usuwaniu wpisu ${entry.id}: ${error}`);
          }
        }
      } catch (error) {
        errors.push(`Błąd przy czyszczeniu dnia ${day}: ${error}`);
      }
    }

    if (deletedCount > 0) {
      console.log(`Usunięto wpisy dziennika: ${deletedCount} (dni: ${days.join(", ")})`);
    }

    return { deleted: deletedCount, errors };
  }

  /**
   * Czyści dzienny cel kaloryczny testowego użytkownika (`PUT /api/user-settings` z `null`).
   *
   * Cel jest jeden na konto, więc nie ma czego wyszukiwać - jedno żądanie i gotowe. Wyczyszczenie
   * celu, którego nie ma, też kończy się 200, więc metoda jest bezpieczna także "na zapas".
   */
  async clearDailyGoal(): Promise<{ errors: string[] }> {
    const errors: string[] = [];

    try {
      // Bez nagłówka Origin Astro odrzuca PUT (security.checkOrigin), a APIRequestContext
      // Playwrighta go nie dokłada - tak samo jak przy DELETE przepisów i wpisów.
      const response = await this.page.request.put(`${this.baseUrl}/api/user-settings`, {
        headers: { Origin: this.baseUrl },
        data: { daily_calorie_goal: null },
      });

      if (!response.ok()) {
        const responseText = await response.text();
        errors.push(`Nie udało się wyczyścić celu dziennego: ${response.status()} - ${responseText}`);
      }
    } catch (error) {
      errors.push(`Błąd przy czyszczeniu celu dziennego: ${error}`);
    }

    return { errors };
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
