import { useState, useEffect } from "react";
import type { RecipeDto } from "../../types";
import { RecipeService } from "../../lib/services/recipe.service";

interface UseRecipeResult {
  recipe: RecipeDto | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania szczegółów przepisu po ID
export function useRecipe(id: number | string | undefined): UseRecipeResult {
  const [recipe, setRecipe] = useState<RecipeDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  useEffect(() => {
    if (!id) {
      setRecipe(null);
      setIsLoading(false);
      return;
    }

    const fetchRecipe = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const recipeService = new RecipeService();
        const recipeId = typeof id === "string" ? parseInt(id) : id;

        if (isNaN(recipeId) || recipeId <= 0) {
          throw new Error("Nieprawidłowe ID przepisu");
        }

        // Używamy rzeczywistego API zamiast mockowanych danych
        const data = await recipeService.getRecipe(recipeId, "current-user");

        if (!data) {
          throw new Error("Przepis nie został znaleziony");
        }

        setRecipe(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Błąd podczas pobierania przepisu";
        setError(new Error(errorMessage));
        console.error("Błąd podczas pobierania przepisu:", err);

        // W przypadku błędu ustawiamy null
        setRecipe(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipe();
  }, [id, refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    recipe,
    isLoading,
    error,
    refetch,
  };
}
