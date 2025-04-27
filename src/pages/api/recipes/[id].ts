import { z } from "zod";
import type { APIRoute } from "astro";
import { RecipeService } from "../../../lib/services/recipe.service";

export const prerender = false;

// Schemat walidacji dla danych wejściowych do aktualizacji przepisu
const updateRecipeSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść przepisu jest wymagana"),
  additional_params: z.string().nullable().optional(),
});

// Handler GET - pobieranie pojedynczego przepisu
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    // Sprawdź autoryzację
    const session = await locals.supabase.auth.getSession();
    if (!session.data.session?.user) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session.data.session.user.id;

    // Pobierz ID przepisu z parametrów ścieżki
    const recipeId = parseInt(params.id || "0", 10);
    if (isNaN(recipeId) || recipeId <= 0) {
      return new Response(JSON.stringify({ error: "Nieprawidłowe ID przepisu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Użyj serwisu do pobrania przepisu
    const recipeService = new RecipeService();
    const recipe = await recipeService.getRecipe(recipeId, userId);

    if (!recipe) {
      return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Zwróć przepis
    return new Response(JSON.stringify(recipe), { status: 200, headers: { "Content-Type": "application/json" } });
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

// Handler PUT - aktualizacja przepisu
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    // Sprawdź autoryzację
    const session = await locals.supabase.auth.getSession();
    if (!session.data.session?.user) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session.data.session.user.id;

    // Pobierz ID przepisu z parametrów ścieżki
    const recipeId = parseInt(params.id || "0", 10);
    if (isNaN(recipeId) || recipeId <= 0) {
      return new Response(JSON.stringify({ error: "Nieprawidłowe ID przepisu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = updateRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Przygotuj dane do aktualizacji przepisu
    const command = {
      title: validationResult.data.title,
      content: validationResult.data.content,
      additional_params: validationResult.data.additional_params ?? null,
    };

    // Użyj serwisu do aktualizacji przepisu
    const recipeService = new RecipeService();
    const updatedRecipe = await recipeService.updateRecipe(recipeId, userId, command);

    if (!updatedRecipe) {
      return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Zwróć zaktualizowany przepis
    return new Response(JSON.stringify(updatedRecipe), {
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

// Handler DELETE - usuwanie przepisu
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    // Sprawdź autoryzację
    const session = await locals.supabase.auth.getSession();
    if (!session.data.session?.user) {
      return new Response(JSON.stringify({ error: "Brak autoryzacji" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session.data.session.user.id;

    // Pobierz ID przepisu z parametrów ścieżki
    const recipeId = parseInt(params.id || "0", 10);
    if (isNaN(recipeId) || recipeId <= 0) {
      return new Response(JSON.stringify({ error: "Nieprawidłowe ID przepisu" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Użyj serwisu do usunięcia przepisu
    const recipeService = new RecipeService();
    const deleted = await recipeService.deleteRecipe(recipeId, userId);

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Zwróć potwierdzenie usunięcia
    return new Response(JSON.stringify({ success: true, message: "Przepis został usunięty" }), {
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
