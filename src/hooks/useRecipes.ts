import { useState, useEffect } from "react";
import type { PaginatedRecipesDto, RecipeDto, RecipeSortParams, PaginationParams } from "../types";

interface UseFetchRecipesParams extends PaginationParams, RecipeSortParams {}

interface UseFetchRecipesResult {
  data: RecipeDto[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania listy przepisów z paginacją i sortowaniem
export function useFetchRecipes(params: UseFetchRecipesParams = {}): UseFetchRecipesResult {
  const [data, setData] = useState<RecipeDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  const { limit = 10, offset = 0, sort = "created_at", order = "desc" } = params;

  useEffect(() => {
    const fetchRecipes = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Budowanie query string
        const queryParams = new URLSearchParams();
        queryParams.append("limit", limit.toString());
        queryParams.append("offset", offset.toString());
        queryParams.append("sort", sort);
        queryParams.append("order", order);

        // Tu będzie rzeczywiste wywołanie API
        // const response = await fetch(`/api/recipes?${queryParams.toString()}`);

        // Mockowanie danych dla celów implementacji
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Tworzymy przykładowe dane
        const mockRecipes: RecipeDto[] = Array.from({ length: limit }, (_, i) => ({
          id: offset + i + 1,
          title: `Przepis ${offset + i + 1}`,
          content: `Zawartość przepisu ${offset + i + 1}. To jest przykładowy opis.`,
          additional_params: i % 2 === 0 ? "bezglutenowy, wegetariański" : null,
          user_id: "123",
          created_at: new Date(Date.now() - i * 86400000).toISOString(),
          updated_at: new Date(Date.now() - i * 43200000).toISOString(),
          ai_generated: i % 3 === 0,
          original_recipe_id: i % 5 === 0 ? 1 : null,
        }));

        const mockResponse: PaginatedRecipesDto = {
          data: mockRecipes,
          total: 100,
          limit,
          offset,
        };

        setData(mockResponse.data);
        setTotal(mockResponse.total);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Błąd podczas pobierania przepisów"));
        console.error("Błąd podczas pobierania przepisów:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipes();
  }, [limit, offset, sort, order, refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    data,
    total,
    isLoading,
    error,
    refetch,
  };
}
