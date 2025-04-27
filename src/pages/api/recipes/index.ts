import { z } from "zod";
import type { APIRoute } from "astro";
import { RecipeService } from "../../../lib/services/recipe.service";

export const prerender = false;

// Schemat walidacji dla danych wejściowych do tworzenia przepisu
const createRecipeSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść przepisu jest wymagana"),
  additional_params: z.string().nullable().optional(),
});

// Schemat walidacji dla parametrów paginacji i sortowania
const paginationSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  sort: z.enum(["created_at", "updated_at", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

// Handler GET - pobieranie listy przepisów
export const GET: APIRoute = async ({ locals, url }) => {
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

    // Pobierz i zwaliduj parametry paginacji i sortowania
    const params = Object.fromEntries(url.searchParams.entries());
    const validationResult = paginationSchema.safeParse(params);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe parametry",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { limit, offset, sort, order } = validationResult.data;

    // Użyj serwisu do pobrania przepisów
    const recipeService = new RecipeService();
    const result = await recipeService.getUserRecipes(userId, { limit, offset }, { sort, order });

    // Zwróć listę przepisów
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
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

// Handler POST - tworzenie nowego przepisu
export const POST: APIRoute = async ({ request, locals }) => {
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

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = createRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Przygotuj dane do utworzenia przepisu z poprawnym typem dla additional_params
    const command = {
      title: validationResult.data.title,
      content: validationResult.data.content,
      additional_params: validationResult.data.additional_params ?? null,
    };

    // Użyj serwisu do utworzenia przepisu
    const recipeService = new RecipeService();
    const result = await recipeService.createRecipe(userId, command);

    // Zwróć utworzony przepis
    return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } });
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
