import type { APIRoute } from "astro";
import type { UserStatsDto } from "../../../types";
import { dbError } from "../../../lib/utils/db-error";
import { logError } from "../../../lib/utils/log";
import type { LogContext } from "../../../lib/utils/log";

export const prerender = false;

// Handler GET - pobieranie statystyk użytkownika
export const GET: APIRoute = async ({ locals }) => {
  // Kontekst rośnie razem z tym, co trasa już wie - zewnętrzny catch loguje go w stanie z chwili
  // awarii.
  const logContext: LogContext = { requestId: locals.requestId, route: "users.stats" };

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

    logContext.userId = user.id;

    // Pobierz statystyki przepisów dla użytkownika
    const { data: recipes, error } = await locals.supabase
      .from("recipes")
      .select("id, is_ai_generated, created_at")
      .eq("user_id", user.id);

    if (error) {
      throw dbError(error, "users.stats");
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
    // Komunikat zostaje na serwerze. Awaria PostgREST niesie w treści nazwy kolumn, nazwy
    // ograniczeń i brzmienie polityk RLS - do przeglądarki idzie stała i `requestId`, po którym
    // linię logu z pełnym błędem da się znaleźć.
    logError("users.stats_failed", logContext, error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
