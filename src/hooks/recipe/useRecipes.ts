import { useState, useEffect } from "react";
import type { RecipeDto, RecipeSortParams } from "../../types";
import { RecipeService } from "../../lib/services/recipe.service";

interface UseFetchRecipesParams extends RecipeSortParams {
  search?: string;
}

interface UseFetchRecipesResult {
  data: RecipeDto[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania listy przepisów z sortowaniem i wyszukiwaniem
export function useFetchRecipes(params: UseFetchRecipesParams = {}): UseFetchRecipesResult {
  const [data, setData] = useState<RecipeDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  const { sort = "created_at", order = "desc", search = "" } = params;

  useEffect(() => {
    const fetchRecipes = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const recipeService = new RecipeService();

        // Używamy prawdziwego serwisu z API endpoints
        const result = await recipeService.getUserRecipes(
          "current-user", // userId - auth jest zarządzane przez cookies w API
          { sort, order },
          search || undefined
        );

        setData(result.data);
        setTotal(result.total);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Błąd podczas pobierania przepisów";
        setError(new Error(errorMessage));
        console.error("Błąd podczas pobierania przepisów:", err);

        // W przypadku błędu ustawiamy puste dane
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipes();
  }, [sort, order, search, refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    data,
    total,
    isLoading,
    error,
    refetch,
  };
}
