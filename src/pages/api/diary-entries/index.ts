import type { APIRoute } from "astro";
import { DiaryService, RecipeNotFoundError } from "../../../lib/services/diary.service";
import { createDiaryEntrySchema } from "../../../lib/validations/diary/create-entry";
import { listDiaryEntriesSchema } from "../../../lib/validations/diary/list-entries";
import { zodIssues } from "../../../lib/utils/validation-errors";

export const prerender = false;

// Handler GET - wpisy dziennika z jednego dnia
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    // Sprawdź autoryzację. Żądanie bez sesji zwykle nie dociera tutaj - middleware przekierowuje
    // ścieżki spoza PUBLIC_PATHS na /auth/login - ale 401 zostaje jako druga linia obrony.
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

    // Pobierz i zwaliduj parametry zapytania
    const params = Object.fromEntries(url.searchParams.entries());
    const validationResult = listDiaryEntriesSchema.safeParse(params);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe parametry",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const diaryService = new DiaryService(locals.supabase);
    const result = await diaryService.getEntriesForDay(user.id, validationResult.data.date);

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

// Handler POST - tworzenie wpisu dziennika
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

    // Pobierz i zwaliduj dane wejściowe. Body, które nie jest JSON-em, to błąd wejścia, a nie
    // awaria serwera: bez tego `catch` wyjątek z `request.json()` trafiłby do zewnętrznego
    // catcha i wróciłby jako 500. `null` nie przechodzi schematu, więc odpowiada ta sama 400.
    const rawData = await request.json().catch(() => null);
    const validationResult = createDiaryEntrySchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const diaryService = new DiaryService(locals.supabase);
    const entry = await diaryService.createEntry(user.id, {
      entry_date: validationResult.data.entry_date,
      content: validationResult.data.content,
      amount_text: validationResult.data.amount_text ?? null,
      calories: validationResult.data.calories ?? null,
      source_recipe_id: validationResult.data.source_recipe_id ?? null,
      portions: validationResult.data.portions ?? null,
    });

    // Zwróć utworzony wpis
    return new Response(JSON.stringify(entry), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Wskazanie cudzego albo nieistniejącego przepisu to jedyny błąd tej ścieżki, który nie jest
    // awarią serwera. Komunikat celowo ten sam, którym odpowiada `recipes/[id].ts`.
    if (error instanceof RecipeNotFoundError) {
      return new Response(JSON.stringify({ error: "Przepis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

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
