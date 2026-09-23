import type { APIRoute } from "astro";
import { DiaryService } from "../../../lib/services/diary.service";
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

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
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
    });

    // Zwróć utworzony wpis
    return new Response(JSON.stringify(entry), { status: 201, headers: { "Content-Type": "application/json" } });
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
