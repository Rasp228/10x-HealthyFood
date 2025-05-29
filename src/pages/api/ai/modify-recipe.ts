import { z } from "zod";
import type { APIRoute } from "astro";
import { AIService } from "../../../lib/services/ai.service";

export const prerender = false;

// Schemat walidacji dla danych wejściowych
const modifyRecipeSchema = z.object({
  additional_params: z.string().min(1, "Parametry modyfikacji są wymagane"),
  base_recipe: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Nieautoryzowany dostęp",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = modifyRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pobierz ID przepisu z danych wejściowych (zamiast z URL)
    const recipeId = rawData.recipe_id;
    if (!recipeId || isNaN(parseInt(recipeId)) || parseInt(recipeId) <= 0) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe ID przepisu",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsedRecipeId = parseInt(recipeId);

    // Sprawdź czy przepis istnieje i należy do użytkownika
    const { data: recipe, error: recipeError } = await locals.supabase
      .from("recipes")
      .select("*")
      .eq("id", parsedRecipeId)
      .eq("user_id", user.id)
      .single();

    if (recipeError || !recipe) {
      return new Response(
        JSON.stringify({
          error: "Przepis nie został znaleziony",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const command = {
      additional_params: validationResult.data.additional_params,
      base_recipe: validationResult.data.base_recipe || JSON.stringify(recipe),
    };

    // Użyj serwisu AI do modyfikacji przepisu
    const aiService = new AIService();
    const result = await aiService.modifyRecipe(user.id, parsedRecipeId, command);

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Nie udało się zmodyfikować przepisu",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Zwróć zmodyfikowany przepis
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa błędów
    const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";

    return new Response(
      JSON.stringify({
        error: "Błąd wewnętrzny serwera",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
