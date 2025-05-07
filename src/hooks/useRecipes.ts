import { useState, useEffect } from "react";
import type { PaginatedRecipesDto, RecipeDto, RecipeSortParams, PaginationParams } from "../types";

interface UseFetchRecipesParams extends PaginationParams, RecipeSortParams {
  search?: string;
}

interface UseFetchRecipesResult {
  data: RecipeDto[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// Hook do pobierania listy przepisów z paginacją, sortowaniem i wyszukiwaniem
export function useFetchRecipes(params: UseFetchRecipesParams = {}): UseFetchRecipesResult {
  const [data, setData] = useState<RecipeDto[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [refresh, setRefresh] = useState<number>(0);

  const { limit = 10, offset = 0, sort = "created_at", order = "desc", search = "" } = params;

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
        if (search) {
          queryParams.append("search", search.trim());
        }

        // Tu będzie rzeczywiste wywołanie API
        // const response = await fetch(`/api/recipes?${queryParams.toString()}`);

        // Mockowanie danych dla celów implementacji
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Tworzymy większy zbiór przykładowych danych dla lepszej filtracji
        const allMockRecipes: RecipeDto[] = Array.from({ length: 50 }, (_, i) => {
          const recipeTypes = [
            "Sałatka",
            "Zupa",
            "Ciasto",
            "Deser",
            "Koktajl",
            "Danie główne",
            "Przekąska",
            "Śniadanie",
            "Kolacja",
          ];
          const ingredients = [
            "pomidory",
            "ogórki",
            "cebula",
            "czosnek",
            "kurczak",
            "wołowina",
            "ryż",
            "makaron",
            "ziemniaki",
            "marchew",
            "brokuły",
            "szpinak",
            "jajka",
            "mleko",
            "śmietana",
            "ser",
            "masło",
            "oliwa",
            "mąka",
            "cukier",
            "sól",
            "pieprz",
            "bazylia",
            "oregano",
          ];

          // Losowo wybieramy typ przepisu i składniki
          const recipeType = recipeTypes[Math.floor(Math.random() * recipeTypes.length)];
          const recipeIngredient1 = ingredients[Math.floor(Math.random() * ingredients.length)];
          const recipeIngredient2 = ingredients[Math.floor(Math.random() * ingredients.length)];
          const recipeIngredient3 = ingredients[Math.floor(Math.random() * ingredients.length)];

          const dietary = ["wegetariański", "wegański", "bezglutenowy", "niskokaloryczny", "bez laktozy"];
          const dietaryTags =
            i % 3 === 0
              ? `${dietary[i % dietary.length]}, ${dietary[(i + 1) % dietary.length]}`
              : dietary[i % dietary.length];

          return {
            id: i + 1,
            title: `${recipeType} z ${recipeIngredient1} i ${recipeIngredient2}`,
            content: `Pyszny przepis na ${recipeType}. Składniki: ${recipeIngredient1}, ${recipeIngredient2}, ${recipeIngredient3}. 
                     Przygotowanie: Pokrój wszystkie składniki, wymieszaj i gotuj przez 15 minut.`,
            additional_params: dietaryTags,
            user_id: "123",
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
            updated_at: new Date(Date.now() - i * 43200000).toISOString(),
            ai_generated: i % 3 === 0,
            original_recipe_id: i % 5 === 0 ? 1 : null,
          };
        });

        // Sortowanie według wybranego pola
        const sortedRecipes = [...allMockRecipes];
        if (sort === "title") {
          sortedRecipes.sort((a, b) => {
            return order === "asc" ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title);
          });
        } else if (sort === "created_at" || sort === "updated_at") {
          sortedRecipes.sort((a, b) => {
            const dateA = new Date(a[sort]).getTime();
            const dateB = new Date(b[sort]).getTime();
            return order === "asc" ? dateA - dateB : dateB - dateA;
          });
        }

        // Filtrowanie wyników jeśli podano wyszukiwanie
        let filteredRecipes = sortedRecipes;
        if (search && search.trim() !== "") {
          const searchLower = search.toLowerCase().trim();
          filteredRecipes = sortedRecipes.filter(
            (recipe) =>
              recipe.title.toLowerCase().includes(searchLower) ||
              recipe.content.toLowerCase().includes(searchLower) ||
              (recipe.additional_params && recipe.additional_params.toLowerCase().includes(searchLower))
          );
        }

        // Zastosowanie paginacji
        const paginatedRecipes = filteredRecipes.slice(offset, offset + limit);

        const mockResponse: PaginatedRecipesDto = {
          data: paginatedRecipes,
          total: filteredRecipes.length,
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
  }, [limit, offset, sort, order, search, refresh]);

  const refetch = () => setRefresh((prev) => prev + 1);

  return {
    data,
    total,
    isLoading,
    error,
    refetch,
  };
}
