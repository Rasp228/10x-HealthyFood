import { useState, useEffect } from "react";
import type { RecipeDto } from "../types";

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
        // Tu będzie rzeczywiste wywołanie API
        // const response = await fetch(`/api/recipes/${id}`);
        // if (!response.ok) {
        //   throw new Error(`Nie udało się pobrać przepisu (${response.status})`);
        // }
        // const data = await response.json();

        // Mockowanie danych dla celów implementacji
        await new Promise((resolve) => setTimeout(resolve, 600));

        // Tworzymy przykładowy przepis
        const mockRecipe: RecipeDto = {
          id: typeof id === "string" ? parseInt(id) : id,
          title: `Przepis ${id}`,
          content: `# Przepis ${id}\n\n## Składniki\n- 2 jabłka\n- 1 łyżka cynamonu\n- 3 łyżki cukru\n\n## Przygotowanie\n1. Pokrój jabłka w kostkę\n2. Wymieszaj z cynamonem i cukrem\n3. Zapiekaj 20 minut w piekarniku rozgrzanym do 180 stopni`,
          additional_params: Number(id) % 2 === 0 ? "bezglutenowy, wegetariański" : null,
          user_id: "123",
          created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
          updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          ai_generated: Number(id) % 3 === 0,
          original_recipe_id: Number(id) % 5 === 0 ? 1 : null,
        };

        setRecipe(mockRecipe);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Błąd podczas pobierania przepisu"));
        console.error("Błąd podczas pobierania przepisu:", err);
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
