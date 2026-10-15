import type { APIRoute } from "astro";
import { buildIlikeOrFilter, toContainsPattern } from "../../../lib/utils/recipe-search";
import { zodIssues } from "../../../lib/utils/validation-errors";
import { dbError } from "../../../lib/utils/db-error";
import { logError } from "../../../lib/utils/log";
import type { LogContext } from "../../../lib/utils/log";
import { createRecipeSchema } from "../../../lib/validations/recipe/create-recipe";
import { listRecipesSchema } from "../../../lib/validations/recipe/list-recipes";

export const prerender = false;

// Handler GET - pobieranie listy przepisów
export const GET: APIRoute = async ({ locals, url }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "recipes.get" };

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

    // Pobierz i zwaliduj parametry sortowania
    const params = Object.fromEntries(url.searchParams.entries());
    const validationResult = listRecipesSchema.safeParse(params);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe parametry",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { sort = "created_at", order = "desc", search, search_field: searchField, limit } = validationResult.data;

    // Budowanie zapytania z wyszukiwaniem
    let query = locals.supabase.from("recipes").select("*", { count: "exact" }).eq("user_id", user.id);

    // Dodanie wyszukiwania jeśli podano
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();

      // Obie gałęzie uciekają wieloznaczniki LIKE w `toContainsPattern`; gałąź ogólna dodatkowo
      // cytuje wartość w gramatyce `or()` - oba poziomy opisuje `lib/utils/recipe-search.ts`.
      const pattern = toContainsPattern(searchTerm);

      if (searchField === "title") {
        // `.ilike()` przekazuje wartość osobnym parametrem, więc wystarcza sam poziom LIKE.
        query = query.ilike("title", pattern);
      } else {
        query = query.or(buildIlikeOrFilter(["title", "content", "additional_params"], pattern));
      }
    }

    // Sortowanie
    query = query.order(sort, { ascending: order === "asc" });

    // `count: "exact"` zostaje nietknięty, więc `total` nadal podaje pełną liczbę trafień, a nie
    // liczbę zwróconych wierszy - dzięki temu dziennik może napisać „pokazano 10 z 23".
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    const { data, error, count } = await query;

    if (error) {
      throw dbError(error, "recipes.get");
    }

    // Zwróć listę przepisów w formacie zgodnym z RecipesDto
    const result = {
      data: data || [],
      total: count || 0,
    };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze. Awaria PostgREST niesie w treści nazwy kolumn, nazwy
    // ograniczeń i brzmienie polityk RLS - do przeglądarki idzie stała i `requestId`, po którym
    // linię logu z pełnym błędem da się znaleźć.
    logError("recipes.get_failed", logContext, error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Handler POST - tworzenie nowego przepisu
export const POST: APIRoute = async ({ request, locals }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "recipes.post" };

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

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera (wzorzec
    // `user-settings/index.ts`): `null` nie przechodzi schematu, więc odpowiada ta sama 400.
    const rawData = await request.json().catch(() => null);
    const validationResult = createRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Przygotuj dane do utworzenia przepisu
    const recipeData = {
      title: validationResult.data.title,
      content: validationResult.data.content,
      additional_params: validationResult.data.additional_params ?? null,
      is_ai_generated: validationResult.data.is_ai_generated,
      user_id: user.id,
    };

    // Utwórz przepis w bazie danych
    const { data, error } = await locals.supabase.from("recipes").insert(recipeData).select().single();

    if (error) {
      throw dbError(error, "recipes.post");
    }

    // Zwróć utworzony przepis
    return new Response(JSON.stringify(data), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała i `requestId`, do logu pełny błąd.
    logError("recipes.post_failed", logContext, error);
    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
