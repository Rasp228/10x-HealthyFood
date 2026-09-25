import type { APIRoute } from "astro";
import { DiaryService, RecipeNotFoundError } from "../../../../lib/services/diary.service";
import { CalorieEstimationService } from "../../../../lib/services/calorie-estimation.service";
import { entryIdSchema } from "../../../../lib/validations/diary/set-calories";
import { zodIssues } from "../../../../lib/utils/validation-errors";
import { OpenRouterError } from "../../../../lib/api/openrouter.types";

export const prerender = false;

/**
 * Granice wartości, która trafi do bazy. Te same, co w `caloriesValueSchema`, w checku migracji
 * i w `recipe-nutrition.ts` - iloczyn porcji musi przejść przez nie drugi raz, bo `extractCalories`
 * pilnuje tylko wartości JEDNEJ porcji.
 */
const MIN_TOTAL_CALORIES = 0;
const MAX_TOTAL_CALORIES = 5000;

/**
 * Handler POST - zlecenie oszacowania kalorii dla wpisu dziennika.
 *
 * Bez ciała żądania: opis pochodzi z wiersza, nie od klienta. Gdyby przyszedł w żądaniu, można by
 * wysłać do modelu cokolwiek i zapisać wynik jako pochodzący z opisu wpisu. Treść przepisu podlega
 * tej samej zasadzie - czytamy ją z bazy, filtrem po `user_id`, nigdy z żądania.
 *
 * Kaskada ma trzy gałęzie w tej kolejności: wpis z wartością kończy się bez modelu, wpis
 * ze wskazanym własnym przepisem jest wyceniany z jego treści i mnożony przez liczbę porcji
 * (`ai_from_recipe`), a każdy inny - z samego opisu (`ai_from_description`).
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

    // Gałąź przepisowa zaczyna się od odczytu treści przepisu - tym samym filtrem po `user_id`,
    // którym czyta ją zapis wpisu. Dwa różne braki znaczą tu jedno i to samo: `null` (wpis nie
    // pochodzi z przepisu) oraz `RecipeNotFoundError` (przepis usunięty albo cudzy) kierują na
    // gałąź opisową. Ten rzut NIGDY nie daje 404 - wpis istnieje, brakuje wyłącznie przepisu.
    let recipeContent: string | null = null;

    try {
      recipeContent = await diaryService.readOwnRecipeContent(user.id, entry.source_recipe_id);
    } catch (error) {
      if (!(error instanceof RecipeNotFoundError)) {
        throw error;
      }
    }

    let estimate: number | null;

    // Pochodzenie ustala ta sama gałąź, która policzy wartość. Inaczej wiersz dostałby etykietę
    // źródła, którego model w ogóle nie widział.
    const origin = recipeContent === null ? "ai_from_description" : "ai_from_recipe";

    try {
      const estimationService = new CalorieEstimationService();

      if (recipeContent === null) {
        estimate = await estimationService.estimateFromDescription(entry.content, entry.amount_text);
      } else {
        // Model odpowiada na jedno pytanie - ile ma JEDNA porcja - a mnożenie i zaokrąglenie robi
        // kod, tak samo jak `resolveRecipeCalories`.
        //
        // Iloczyn liczymy PRZED `applyEstimate`, nie po: do zapisu ma dojechać liczba gotowa do
        // wejścia w sumę dnia. Iloczyn poza zakresem jest więc traktowany jak brak wartości -
        // inaczej wpis dostałby `calories: 12000` z etykietą „oszacowane z przepisu", której suma
        // dnia nie ma jak zakwestionować.
        //
        // `?? 1` jest obowiązkowe, nie defensywne: parę `portions` + `source_recipe_id` wymusza
        // tylko schemat tworzenia wpisu, kolumna w bazie jej nie pilnuje, a `null * cokolwiek`
        // to `NaN`, które przeszłoby zaokrąglenie i wywróciło się dopiero na ograniczeniu bazy.
        const perPortion = await estimationService.estimateFromRecipe(recipeContent, entry.content);
        const total = perPortion === null ? null : Math.round(perPortion * (entry.portions ?? 1));

        estimate = total !== null && total >= MIN_TOTAL_CALORIES && total <= MAX_TOTAL_CALORIES ? total : null;
      }
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

    const updated = await diaryService.applyEstimate(user.id, entryId, estimate, origin);

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
