import type { APIRoute } from "astro";
import type { DiaryEntryDto, UpdateDiaryEntryCommand } from "../../../types";
import { DiaryService, EntryShapeError } from "../../../lib/services/diary.service";
import { entryIdSchema, updateDiaryEntrySchema } from "../../../lib/validations/diary/update-entry";
import { zodIssues, type ValidationIssue } from "../../../lib/utils/validation-errors";

export const prerender = false;

/**
 * Handler PATCH - częściowa edycja istniejącego wpisu.
 *
 * Zmienia tylko pola, które przyszły w ciele: treść, ilość (tekst albo liczbę porcji - zależnie
 * od kształtu zapisanego wiersza), dzień i wartość. Wartość i jej pochodzenie stoją, dopóki
 * użytkownik jawnie ich nie dotknie: `calories: N` zapisuje liczbę "wpisane ręcznie",
 * `calories: null` ją czyści, a `recalculate: true` zeruje wartość i od razu próbuje parsera
 * przepisu. Dawne ciało `{calories: N}` z pola w wierszu daje ten sam wynik co przed poszerzeniem.
 *
 * Przepisu wpisu nie da się tu zmienić - `source_recipe_id` w ciele to 400, jak każde pole spoza
 * schematu.
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
    const validationResult = updateDiaryEntrySchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const command: UpdateDiaryEntryCommand = validationResult.data;

    const diaryService = new DiaryService(locals.supabase);
    let entry: DiaryEntryDto | null;

    try {
      entry = await diaryService.updateEntry(user.id, idResult.data, command);
    } catch (error) {
      // Kształt ilości sprawdza serwis względem zapisanego wiersza - to wciąż błąd wejścia, więc
      // wychodzi w tym samym kształcie co błędy schematu i formularz pokaże go przy polu.
      if (error instanceof EntryShapeError) {
        const details: ValidationIssue[] = [{ path: error.path, message: error.message }];

        return new Response(JSON.stringify({ error: "Nieprawidłowe dane wejściowe", details }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw error;
    }

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
    console.error("Błąd podczas edycji wpisu dziennika:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

/**
 * Handler DELETE - usunięcie wpisu.
 *
 * Bez ciała w obie strony: 204 po usunięciu, 404, gdy takiego wpisu u tego użytkownika nie ma.
 * Potwierdzenie usunięcia jest sprawą interfejsu, nie trasy.
 */
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    // Druga linia obrony za middleware, tak jak w PATCH.
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

    const diaryService = new DiaryService(locals.supabase);
    const deleted = await diaryService.deleteEntry(user.id, idResult.data);

    if (!deleted) {
      return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    // Jak w PATCH: do przeglądarki stała, do logu pełny błąd.
    console.error("Błąd podczas usuwania wpisu dziennika:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
