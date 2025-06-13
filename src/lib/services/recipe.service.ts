import type { CreateRecipeCommand, RecipesDto, RecipeDto, RecipeSortParams, UpdateRecipeCommand } from "../../types";

/**
 * Serwis obsługujący zarządzanie przepisami kulinarnymi
 * Wszystkie operacje wykonywane przez bezpieczne API endpointy
 */
export class RecipeService {
  /**
   * Pobiera listę przepisów użytkownika z sortowaniem
   * @param userId - ID użytkownika (używane dla walidacji, ale auth jest przez cookies)
   * @param sort - Parametry sortowania (sort, order)
   * @param search - Opcjonalne wyszukiwanie
   * @returns Lista przepisów
   */
  async getUserRecipes(userId: string, sort: RecipeSortParams = {}, search?: string): Promise<RecipesDto> {
    try {
      // Budowanie query string
      const queryParams = new URLSearchParams();

      if (sort.sort) queryParams.append("sort", sort.sort);
      if (sort.order) queryParams.append("order", sort.order);
      if (search) queryParams.append("search", search.trim());

      const response = await fetch(`/api/recipes?${queryParams.toString()}`, {
        method: "GET",
        credentials: "include", // Ważne dla przesyłania cookies z sesją
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching user recipes:", error);
      throw error instanceof Error ? error : new Error("Nieznany błąd podczas pobierania przepisów");
    }
  }

  /**
   * Pobiera pojedynczy przepis
   * @param recipeId - ID przepisu
   * @returns Przepis lub null jeśli nie znaleziono
   */
  async getRecipe(recipeId: number): Promise<RecipeDto | null> {
    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "GET",
        credentials: "include",
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching recipe:", error);
      throw error instanceof Error ? error : new Error("Nieznany błąd podczas pobierania przepisu");
    }
  }

  /**
   * Tworzy nowy przepis
   * @param userId - ID użytkownika (dla walidacji)
   * @param command - Dane do utworzenia przepisu
   * @returns Utworzony przepis
   */
  async createRecipe(userId: string, command: CreateRecipeCommand): Promise<RecipeDto> {
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error creating recipe:", error);
      throw error instanceof Error ? error : new Error("Nieznany błąd podczas tworzenia przepisu");
    }
  }

  /**
   * Aktualizuje istniejący przepis
   * @param recipeId - ID przepisu do aktualizacji
   * @param userId - ID użytkownika (dla weryfikacji właściciela)
   * @param command - Dane do aktualizacji przepisu
   * @returns Zaktualizowany przepis lub null jeśli nie znaleziono
   */
  async updateRecipe(recipeId: number, userId: string, command: UpdateRecipeCommand): Promise<RecipeDto | null> {
    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(command),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating recipe:", error);
      throw error instanceof Error ? error : new Error("Nieznany błąd podczas aktualizacji przepisu");
    }
  }

  /**
   * Usuwa przepis
   * @param recipeId - ID przepisu do usunięcia
   * @returns true jeśli usunięto, false jeśli nie znaleziono
   */
  async deleteRecipe(recipeId: number): Promise<boolean> {
    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.status === 404) {
        return false;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error("Error deleting recipe:", error);
      throw error instanceof Error ? error : new Error("Nieznany błąd podczas usuwania przepisu");
    }
  }
}
