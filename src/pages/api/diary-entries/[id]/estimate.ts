import type { APIRoute } from "astro";
import { DiaryService, RecipeNotFoundError } from "../../../../lib/services/diary.service";
import { CalorieEstimationService } from "../../../../lib/services/calorie-estimation.service";
import { entryIdSchema } from "../../../../lib/validations/diary/update-entry";
import { formatPortions } from "../../../../lib/utils/diary-portions";
import { zodIssues } from "../../../../lib/utils/validation-errors";
import { OpenRouterError } from "../../../../lib/api/openrouter.types";
import { logError, logInfo, logWarn } from "../../../../lib/utils/log";
import type { LogContext } from "../../../../lib/utils/log";

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
  // Kontekst rośnie razem z tym, co trasa już wie (kto, który wpis, która gałąź) - zewnętrzny catch
  // loguje go w stanie z chwili awarii.
  const logContext: LogContext = { requestId: locals.requestId, route: "diary.estimate" };

  try {
    // Sprawdź autoryzację. Żądanie bez sesji zwykle nie dociera tutaj - middleware przekierowuje
    // ścieżki spoza PUBLIC_PATHS na /auth/login - ale 401 zostaje jako druga linia obrony.
    // Użytkownik z `locals.user`, rozstrzygniętego już w middleware: drugie `getUser()` w trasie
    // dawało przy czkawce GoTrue 401 bez żadnej przyczyny w logu.
    const user = locals.user;

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
    logContext.userId = user.id;
    logContext.entryId = entryId;

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

      // Wpis wskazuje przepis, którego już nie ma (albo nie jest jego) - wycena schodzi na opis.
      // Bez tej linii wartość "z opisu" przy wpisie z przepisu nie miałaby w logu wyjaśnienia.
      logInfo("estimate.recipe_missing_fallback", { ...logContext, recipeId: entry.source_recipe_id });
    }

    let estimate: number | null;

    // Pochodzenie ustala ta sama gałąź, która policzy wartość. Inaczej wiersz dostałby etykietę
    // źródła, którego model w ogóle nie widział.
    const origin = recipeContent === null ? "ai_from_description" : "ai_from_recipe";
    logContext.branch = origin;

    // Czas od konstrukcji klienta do odpowiedzi modelu: z nim w logu widać, czy 502 to timeout
    // na granicy 55 s, czy natychmiastowa odmowa.
    const startedAt = Date.now();

    try {
      const estimationService = new CalorieEstimationService();

      if (recipeContent === null) {
        // Sierota (porcje bez własnego przepisu - usuniętego albo cudzego) nie ma tekstu ilości,
        // więc jej porcje idą do modelu jako ilość. Wynik opisuje cały posiłek i nie jest mnożony.
        // Decyzja z planu `edit-and-delete-entry`, faza 1, pkt 4. Zwykły wpis opisowy bez zmian.
        const amountText = entry.portions !== null ? formatPortions(entry.portions) : entry.amount_text;

        estimate = await estimationService.estimateFromDescription(entry.content, amountText, logContext);
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
        // to w JS `0`, nie `NaN` - przeszłoby bramkę zakresu i ograniczenie bazy, a wpis po cichu
        // dostałby 0 kcal z etykietą „oszacowane z przepisu".
        const portions = entry.portions ?? 1;
        const perPortion = await estimationService.estimateFromRecipe(recipeContent, entry.content, logContext);
        const total = perPortion === null ? null : Math.round(perPortion * portions);

        estimate = total !== null && total >= MIN_TOTAL_CALORIES && total <= MAX_TOTAL_CALORIES ? total : null;

        // Model dał poprawną wartość porcji, a dopiero iloczyn wypadł poza zakres - bez tej linii
        // wyglądałoby to w logu jak model, który nic nie policzył.
        if (total !== null && estimate === null) {
          logWarn("estimate.total_out_of_range", { ...logContext, perPortion, portions });
        }
      }
    } catch (error) {
      // Awaria dostawcy łapana PRZED zewnętrznym catchem trasy: inaczej byłaby w logach
      // nieodróżnialna od zwykłego 500. Wiersz zostaje ze znacznikiem i bez wartości - ta zmiana
      // nigdy go nie zeruje.
      if (error instanceof OpenRouterError) {
        // Status i model odróżniają 401 (klucz) od 429 (limit) i 404 (model), `ms` - timeout od
        // natychmiastowej odmowy.
        logError(
          "estimate.provider_failed",
          { ...logContext, model: error.model, status: error.status, ms: Date.now() - startedAt },
          error
        );

        // Brak klucza to błąd konfiguracji wdrożenia, nie chwilowa niedostępność - "Policz ponownie"
        // go nie naprawi, więc dostaje własny kod.
        const code = error.code === "AI_MISCONFIGURED" ? "AI_MISCONFIGURED" : "AI_UNAVAILABLE";

        return new Response(
          JSON.stringify({
            error: "Usługa AI jest chwilowo niedostępna",
            code,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      throw error;
    }

    // Czas samego modelu - zapis i odczyt poniżej do niego nie wchodzą.
    const ms = Date.now() - startedAt;

    // Odpowiedź bezużyteczna to nie awaria: oddajemy wiersz ze znacznikiem i bez wartości.
    //
    // Odczyt, a nie `entry` z kroku stemplowania: od tamtej chwili minęło do 55 s, a użytkownik
    // mógł w tym czasie zapisać liczbę ręcznie przez `PATCH`. Kopia sprzed wywołania modelu
    // raportowałaby wtedy `calories: null` wbrew bazie - przeglądarka i tak robi re-GET, ale to
    // ciało odpowiedzi jest kontraktem, który dziedziczą S-04 i S-05.
    if (estimate === null) {
      logInfo("estimate.completed", { ...logContext, ms, result: "empty" });

      const current = await diaryService.getEntry(user.id, entryId);

      if (!current) {
        return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(current), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Znacznik z kroku stemplowania: zapis trafi tylko wtedy, gdy nikt w międzyczasie nie
    // unieważnił tego zlecenia (edycja, "Zapisz i przelicz", nowe zlecenie z innej karty).
    const updated = await diaryService.applyEstimate(user.id, entryId, estimate, origin, entry.estimation_requested_at);

    if (!updated) {
      return new Response(JSON.stringify({ error: "Wpis nie został znaleziony" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Zapis odcięty znacznikiem: w międzyczasie ktoś unieważnił zlecenie (edycja, "Zapisz
    // i przelicz", wartość wpisana ręcznie, nowsze zlecenie), więc opłacona wycena przepadła.
    // Rozpoznajemy to po wierszu, który nie niesie tej wyceny - samo `calories === null` przegapiłoby
    // wartość ręczną. Bez tej linii wyglądałoby to jak model, który nic nie policzył.
    const discarded = updated.calories !== estimate || updated.calorie_origin !== origin;

    logInfo("estimate.completed", { ...logContext, ms, result: discarded ? "discarded" : "valued" });

    if (discarded) {
      logWarn("estimate.discarded_stale", { ...logContext, requestedAt: entry.estimation_requested_at });
    }

    return new Response(JSON.stringify(updated), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze. Awaria PostgREST niesie w treści nazwy kolumn, nazwy
    // ograniczeń i brzmienie polityk RLS - do przeglądarki idzie stała i `requestId`, po którym
    // linię logu z pełnym błędem da się znaleźć.
    logError("estimate.failed", logContext, error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
