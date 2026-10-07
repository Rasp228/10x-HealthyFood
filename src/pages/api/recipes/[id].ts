import type { APIRoute } from "astro";
import { zodIssues, type ValidationIssue } from "../../../lib/utils/validation-errors";
import { positiveIdParamSchema } from "../../../lib/validations/common/id";
import { updateRecipeSchema } from "../../../lib/validations/recipe/update-recipe";

export const prerender = false;

/**
 * Identyfikator przepisu z `params.id`. Wspólna reguła kształtu i sufitu int4 (`id serial`):
 * `"12abc"` nie jest już czytane jako 12, a `"2147483648"` nie dociera do PostgREST.
 */
const recipeIdSchema = positiveIdParamSchema({
  required: "Identyfikator przepisu jest wymagany",
  format: "Identyfikator przepisu musi być dodatnią liczbą całkowitą",
  invalid: "Nieprawidłowe ID przepisu",
});

const invalidIdResponse = (details: ValidationIssue[]) =>
  new Response(JSON.stringify({ error: "Nieprawidłowe ID przepisu", details }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

const internalErrorResponse = () =>
  new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });

// Handler GET - pobieranie pojedynczego przepisu
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz ID przepisu z parametrów ścieżki
    const idResult = recipeIdSchema.safeParse(params.id);
    if (!idResult.success) {
      return invalidIdResponse(zodIssues(idResult.error));
    }
    const recipeId = idResult.data;

    // Pobierz przepis z bazy danych
    const { data: recipe, error } = await locals.supabase
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Brak wyników
        return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    // Zwróć przepis
    return new Response(JSON.stringify(recipe), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Error fetching recipe:", error);
    return internalErrorResponse();
  }
};

// Handler PUT - aktualizacja przepisu
export const PUT: APIRoute = async ({ params, request, locals }) => {
  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz ID przepisu z parametrów ścieżki
    const idResult = recipeIdSchema.safeParse(params.id);
    if (!idResult.success) {
      return invalidIdResponse(zodIssues(idResult.error));
    }
    const recipeId = idResult.data;

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera (wzorzec
    // `user-settings/index.ts`): `null` nie przechodzi schematu, więc odpowiada ta sama 400.
    const rawData = await request.json().catch(() => null);
    const validationResult = updateRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Przygotuj dane do aktualizacji przepisu
    const updateData = {
      title: validationResult.data.title,
      content: validationResult.data.content,
      additional_params: validationResult.data.additional_params ?? null,
      updated_at: new Date().toISOString(),
    };

    // Aktualizuj przepis w bazie danych
    const { data: updatedRecipe, error } = await locals.supabase
      .from("recipes")
      .update(updateData)
      .eq("id", recipeId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Brak wyników
        return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw error;
    }

    // Zwróć zaktualizowany przepis
    return new Response(JSON.stringify(updatedRecipe), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Jak w GET: do przeglądarki stała, do logu pełny błąd.
    console.error("Error updating recipe:", error);
    return internalErrorResponse();
  }
};

// Handler DELETE - usuwanie przepisu
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz ID przepisu z parametrów ścieżki
    const idResult = recipeIdSchema.safeParse(params.id);
    if (!idResult.success) {
      return invalidIdResponse(zodIssues(idResult.error));
    }
    const recipeId = idResult.data;

    // Usuń przepis z bazy danych. Bez `.select()` trasa nie wie, czy cokolwiek usunęła - znany dług
    // („Własność rekordów” w `docs/reference/known-drift.md`), celowo poza tą zmianą.
    const { error } = await locals.supabase.from("recipes").delete().eq("id", recipeId).eq("user_id", user.id);

    if (error) {
      throw error;
    }

    // Zwróć potwierdzenie usunięcia
    return new Response(JSON.stringify({ success: true, message: "Przepis został usunięty" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Jak w GET: do przeglądarki stała, do logu pełny błąd.
    console.error("Error deleting recipe:", error);
    return internalErrorResponse();
  }
};
