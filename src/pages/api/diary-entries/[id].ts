import type { APIRoute } from "astro";
import type { SetEntryCaloriesCommand } from "../../../types";
import { DiaryService } from "../../../lib/services/diary.service";
import { entryIdSchema, setEntryCaloriesSchema } from "../../../lib/validations/diary/set-calories";
import { zodIssues } from "../../../lib/utils/validation-errors";

export const prerender = false;

/**
 * Handler PATCH - ręczne ustawienie wartości kalorycznej istniejącego wpisu.
 *
 * Świadomie wąski: jedyne pole, które ta trasa pozwala zmienić, to liczba kalorii. Bez niej
 * kryterium akceptacji US-01 ("po minucie użytkownik może podać liczbę ręcznie") nie da się
 * spełnić - do tej pory nie było żadnej trasy zapisu do istniejącego wiersza dziennika.
 */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    // Sprawdź autoryzację. Żądanie bez sesji zwykle nie dociera tutaj - middleware przekierowuje
    // ścieżki spoza PUBLIC_PATHS na /auth/login - ale 401 zostaje jako druga linia obrony.
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const idResult = entryIdSchema.safeParse(params.id);

    if (!idResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowy identyfikator wpisu",
          details: zodIssues(idResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera: bez tego `catch`
    // wyjątek z `request.json()` trafiłby do zewnętrznego catcha i wróciłby jako 500.
    const rawData = await request.json().catch(() => null);
    const validationResult = setEntryCaloriesSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const command: SetEntryCaloriesCommand = { calories: validationResult.data.calories };

    const diaryService = new DiaryService(locals.supabase);
    const entry = await diaryService.setCaloriesManually(user.id, idResult.data, command.calories);

    // Cudzy wpis jest z perspektywy tej trasy nieodróżnialny od nieistniejącego - i tak ma być.
    if (!entry) {
      return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(entry), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze. Awaria PostgREST niesie w treści nazwy kolumn, nazwy
    // ograniczeń i brzmienie polityk RLS - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Błąd podczas ustawiania wartości kalorycznej wpisu:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
