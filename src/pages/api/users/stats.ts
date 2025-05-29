import type { APIRoute } from "astro";
import type { UserStatsDto } from "../../../types";

export const prerender = false;

// Handler GET - pobieranie statystyk użytkownika
export const GET: APIRoute = async ({ locals }) => {
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

    // Pobierz statystyki przepisów dla użytkownika
    const { data: recipes, error } = await locals.supabase
      .from("recipes")
      .select("id, is_ai_generated, created_at")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    // Oblicz statystyki
    const totalRecipes = recipes?.length || 0;
    const aiGeneratedRecipes =
      recipes?.filter((recipe: { is_ai_generated: boolean }) => recipe.is_ai_generated).length || 0;

    // Znajdź najnowszy przepis
    const lastRecipeDate =
      recipes && recipes.length > 0
        ? recipes.sort(
            (a: { created_at: string }, b: { created_at: string }) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0].created_at
        : undefined;

    const stats: UserStatsDto = {
      totalRecipes,
      aiGeneratedRecipes,
      lastRecipeDate,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa błędów
    const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";

    return new Response(
      JSON.stringify({
        error: "Błąd podczas pobierania statystyk",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
