import type { APIRoute } from "astro";
import { DiaryService } from "../../../../lib/services/diary.service";
import { CalorieEstimationService } from "../../../../lib/services/calorie-estimation.service";
import { entryIdSchema } from "../../../../lib/validations/diary/set-calories";
import { zodIssues } from "../../../../lib/utils/validation-errors";
import { OpenRouterError } from "../../../../lib/api/openrouter.types";

export const prerender = false;

/**
 * Handler POST - zlecenie oszacowania kalorii dla wpisu dziennika.
 *
 * Bez ciała żądania: opis pochodzi z wiersza, nie od klienta. Gdyby przyszedł w żądaniu, można by
 * wysłać do modelu cokolwiek i zapisać wynik jako pochodzący z opisu wpisu.
 *
 * Brak oszacowania NIE jest błędem HTTP - to wiersz bez wartości, czekający na "Policz ponownie"
 * albo na liczbę wpisaną ręcznie. Jedyne wyjście inne niż 200 po walidacji to awaria dostawcy.
 */
export const POST: APIRoute = async ({ params, locals }) => {
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

    const entryId = idResult.data;
    const diaryService = new DiaryService(locals.supabase);

    // Znacznik idzie do bazy PRZED wywołaniem modelu: to on pozwala przeglądarce odróżnić wpis,
    // który właśnie się liczy, od wpisu, którego nikt nie policzył.
    const entry = await diaryService.markEstimationRequested(user.id, entryId);

    if (!entry) {
      return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Wpis miał już wartość, więc zapis warunkowy jej nie tknął. Oddajemy stan faktyczny i nie
    // fatygujemy modelu - liczba raz ustalona nie jest tu nadpisywana.
    if (entry.calories !== null) {
      return new Response(JSON.stringify(entry), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    let estimate: number | null;

    try {
      const estimationService = new CalorieEstimationService();
      estimate = await estimationService.estimateFromDescription(entry.content, entry.amount_text);
    } catch (error) {
      // Awaria dostawcy łapana PRZED zewnętrznym catchem trasy: inaczej byłaby w logach
      // nieodróżnialna od zwykłego 500. Wiersz zostaje ze znacznikiem i bez wartości - ta zmiana
      // nigdy go nie zeruje.
      if (error instanceof OpenRouterError) {
        console.error("Błąd dostawcy AI podczas szacowania kalorii:", error);

        return new Response(
          JSON.stringify({
            error: "Usługa AI jest chwilowo niedostępna",
            code: "AI_UNAVAILABLE",
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      throw error;
    }

    // Odpowiedź bezużyteczna to nie awaria: oddajemy wiersz ze znacznikiem i bez wartości.
    //
    // Odczyt, a nie `entry` z kroku stemplowania: od tamtej chwili minęło do 55 s, a użytkownik
    // mógł w tym czasie zapisać liczbę ręcznie przez `PATCH`. Kopia sprzed wywołania modelu
    // raportowałaby wtedy `calories: null` wbrew bazie - przeglądarka i tak robi re-GET, ale to
    // ciało odpowiedzi jest kontraktem, który dziedziczą S-04 i S-05.
    if (estimate === null) {
      const current = await diaryService.getEntry(user.id, entryId);

      if (!current) {
        return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const updated = await diaryService.applyEstimate(user.id, entryId, estimate);

    if (!updated) {
      return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(updated), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze. Awaria PostgREST niesie w treści nazwy kolumn, nazwy
    // ograniczeń i brzmienie polityk RLS - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Błąd podczas zlecania wyceny kalorii:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
