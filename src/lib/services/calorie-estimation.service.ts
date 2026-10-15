import { OpenRouterService } from "../api/openrouter.service";
import { OpenRouterError } from "../api/openrouter.types";
import type { ChatResponse } from "../api/openrouter.types";
import { logInfo, logWarn } from "../utils/log";
import type { LogContext } from "../utils/log";

/**
 * Powód, dla którego odpowiedź modelu nie dała liczby. Każdy trafia do linii logu
 * `estimate.unusable_response` - bez niego "brak wartości" był w logach niewidoczny.
 * `model_declined` jest osobno: to odpowiedź, o którą prompt wprost prosi, nie usterka.
 */
type UnusableReason = "empty" | "no_json" | "invalid_json" | "no_field" | "not_number" | "out_of_range";

/** Granice akceptowanej wartości - te same, co w `caloriesValueSchema` i w checku migracji. */
const MIN_CALORIES = 0;
const MAX_CALORIES = 5000;

const SYSTEM_MESSAGE = `
Jesteś kalkulatorem wartości energetycznej posiłków. Na podstawie opisu posiłku i podanej ilości
szacujesz liczbę kilokalorii dla CAŁEJ opisanej porcji.

Zasady:
- Zwracasz wyłącznie obiekt JSON w formacie {"calories": <liczba>} i nic poza nim.
- NIGDY nie pokazujesz procesu myślenia, nie dodajesz komentarzy, jednostek ani wyjaśnień.
- "calories" to liczba całkowita z przedziału ${MIN_CALORIES}-${MAX_CALORIES} (kcal dla całej porcji).
- Jeśli ilość nie została podana, przyjmij typową pojedynczą porcję opisanego posiłku.
- Jeśli opis nie pozwala oszacować wartości, zwróć {"calories": null}. Nie zgaduj na chybił trafił.
`;

/**
 * Wiadomość systemowa dla wyceny z treści przepisu.
 *
 * Osobna od `SYSTEM_MESSAGE`, bo pytanie jest inne: tam „ile ma ta porcja, którą opisano", tu
 * „na ile porcji dzieli się ten przepis i ile ma jedna". Format odpowiedzi celowo ten sam, żeby
 * `extractCalories` nie musiał znać dwóch kształtów.
 *
 * Dwa źródła potrafią sobie przeczyć, więc pierwszeństwo jest tu rozstrzygnięte wprost: przepis
 * mówi, co jest w daniu, notatka użytkownika to koryguje.
 */
const RECIPE_SYSTEM_MESSAGE = `
Jesteś kalkulatorem wartości energetycznej posiłków. Na podstawie treści przepisu szacujesz liczbę
kilokalorii JEDNEJ porcji tego przepisu.

Zasady:
- Zwracasz wyłącznie obiekt JSON w formacie {"calories": <liczba>} i nic poza nim.
- NIGDY nie pokazujesz procesu myślenia, nie dodajesz komentarzy, jednostek ani wyjaśnień.
- "calories" to liczba całkowita z przedziału ${MIN_CALORIES}-${MAX_CALORIES} (kcal dla jednej porcji).
- Treść przepisu jest źródłem składników i ich ilości.
- Notatka użytkownika, jeśli jest, koryguje przepis (np. "bez sera", "połowa porcji sera").
  Gdy notatka jest samym tytułem przepisu albo nic nie wnosi, zignoruj ją.
- Zwracasz kalorie JEDNEJ porcji, nie całego przepisu.
- Jeśli przepis nie mówi, na ile porcji jest, przyjmij typowy podział dla takiego dania.
- Jeśli treść nie pozwala oszacować wartości, zwróć {"calories": null}. Nie zgaduj na chybił trafił.
`;

/**
 * Buduje klienta OpenRoutera pod wycenę kalorii.
 *
 * Osobna instancja, nie współdzielona z `AIService`: `responseFormat` jest w tym kliencie globalny,
 * więc jedna instancja na dwa różne kształty odpowiedzi kolidowałaby ze sobą.
 *
 * Brakujący `OPENROUTER_API_KEY` rzuca z konstruktora `OpenRouterService` zwykłym `Error`
 * (`openrouter.service.ts:44-48`). Zamieniamy go na `OpenRouterError`, żeby konfiguracja bez klucza
 * kończyła się w trasie tym samym 502 co klucz nieprawidłowy, a nie 500 z zewnętrznego catcha.
 */
function createEstimationClient(): OpenRouterService {
  try {
    return new OpenRouterService({
      // Pusty napis, a nie `import.meta.env.OPENROUTER_API_KEY`, i to jest szew, nie niedbalstwo.
      //
      // `OpenRouterService` czyta tę zmienną sam: `config.apiKey || import.meta.env.OPENROUTER_API_KEY`
      // (`openrouter.service.ts:43`), a przy pustym wyniku rzuca z konstruktora (tamże, :45-48).
      // Podawanie klucza tutaj było więc redundantne - pusty napis jest falsy i schodzi dokładnie
      // na tę samą ścieżkę, łącznie z rzutem, który niżej zamieniamy na `OpenRouterError`.
      //
      // Czemu w takim razie nie zostawić go dla czytelności: samo wystąpienie `import.meta` w TYM
      // pliku czyni go niemożliwym do zaimportowania w teście jednostkowym. ts-jest kompiluje
      // moduły do CommonJS, a TypeScript zostawia wtedy `import.meta` w wyjściu (TS1343), co Node
      // odrzuca błędem składni - test przewracał się na samym `import`, zanim wykonał choć jedną
      // asercję. Bez tej linii jedynym nosicielem `import.meta` w grafie pozostaje
      // `openrouter.service.ts`, którego test w ogóle nie ładuje, bo go mockuje.
      //
      // Nie "sprzątaj" tego z powrotem na `import.meta.env.OPENROUTER_API_KEY`: zachowanie się nie
      // zmieni, ale `tests/unit/calorie-estimation.service.test.ts` przestanie się uruchamiać.
      apiKey: "",
      // Pięć sekund pod `maxDuration: 60` z `astro.config.mjs`, i ta nierówność jest tu całą rzeczą.
      // Przy 60 = 60 ten timeout był martwy: trasa zużywa czas na `getUser()` i na UPDATE ze
      // znacznikiem ZANIM zawoła model, więc platforma ubijała funkcję, zanim klient zdążył się
      // poddać - a wtedy przeglądarka dostaje stronę błędu Vercela zamiast 502 `AI_UNAVAILABLE`,
      // które trasa umie zbudować (`estimate.ts:71-88`). Zapas musi pokryć ten narzut, stąd 55 s.
      timeout: 55_000,
      // Dokładnie jedna próba i ani jednego powtórzenia. `retries` w tym kliencie liczy PRÓBY
      // (`while (attempt < this.retries)`, openrouter.service.ts:170), a `0` nie przechodzi przez
      // `config.retries || 2` w konstruktorze (:62) - cicho wróciłoby do dwóch prób i ~120 s.
      // Budżet ponawiania należy wyłącznie do przycisku "Policz ponownie", czyli do użytkownika.
      retries: 1,
    });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      throw error;
    }

    // `code`, bo trasa ma odróżnić brak klucza (do naprawy w konfiguracji wdrożenia) od chwilowej
    // niedostępności dostawcy - oba dają 502, ale tylko jedno minie samo.
    const message = error instanceof Error ? error.message : "nieznany błąd";
    throw new OpenRouterError(`Konfiguracja OpenRouter jest niekompletna: ${message}`, {
      cause: error,
      code: "AI_MISCONFIGURED",
    });
  }
}

/**
 * Jedyne miejsce, które rozmawia z modelem w sprawie kalorii.
 *
 * Bez zależności od Supabase - zapis należy do `DiaryService`. Serwis wyłącznie pyta model
 * i sprowadza jego odpowiedź do liczby albo do jej braku.
 */
export class CalorieEstimationService {
  private readonly openRouterService: OpenRouterService;

  /**
   * `setResponseFormat` celowo NIE jest tu wołane.
   *
   * Domyślny model (`nvidia/nemotron-3-ultra-550b-a55b:free`) nie deklaruje w OpenRouterze
   * obsługi `response_format` - w jego `supported_parameters` nie ma ani tej wartości, ani
   * `structured_outputs`. Parametr nie jest odrzucany, tylko ignorowany, a w pomiarach z
   * 2026-09-24 jego obecność psuła treść odpowiedzi: na trzy wywołania jedno wróciło
   * z uszkodzonym kluczem (`{"calories{": 600}`), którego `JSON.parse` nie przyjmuje.
   * Bez tego parametru trzy na trzy wywołania dały czysty obiekt.
   *
   * Kształt odpowiedzi pilnują więc wiadomość systemowa i `extractCalories` - czyli to samo,
   * co pilnowało go dotąd, bo schematu OpenRouter i tak nigdy nie egzekwował.
   */
  constructor() {
    this.openRouterService = createEstimationClient();
  }

  /**
   * Szacuje wartość energetyczną posiłku z jego opisu.
   *
   * Preferencje żywieniowe użytkownika NIE są wysyłane - do policzenia kalorii nic nie wnoszą,
   * a powiększałyby to, co opuszcza produkt.
   *
   * @param content - Opis posiłku wpisany przez użytkownika
   * @param amountText - Ilość podana przez użytkownika albo `null`
   * @param logContext - Kontekst żądania (`requestId`, `userId`, `entryId`, gałąź) doklejany do
   *   linii logu, gdy odpowiedź nie da liczby. Opcjonalny, żeby wywołanie bez trasy dalej działało.
   * @returns Liczba całkowita z przedziału 0-5000 albo `null`, gdy odpowiedź modelu jest
   *   bezużyteczna (brak pola, wartość spoza zakresu, treść nie do sparsowania).
   * @throws {OpenRouterError} Gdy dostawca jest nieosiągalny albo odmówił (sieć, timeout, 401,
   *   429, 5xx). Te błędy celowo NIE są połykane: bez nich trasa nie miałaby z czego zbudować 502,
   *   a awaria dostawcy byłaby w logach nieodróżnialna od halucynacji modelu.
   */
  async estimateFromDescription(
    content: string,
    amountText: string | null,
    logContext: LogContext = {}
  ): Promise<number | null> {
    const userMessage = [`Opis posiłku: ${content}`, `Ilość: ${amountText ?? "nie podano"}`].join("\n");

    const response = await this.openRouterService.sendMessage(userMessage, SYSTEM_MESSAGE);

    return this.extractCalories(response, logContext);
  }

  /**
   * Szacuje wartość energetyczną JEDNEJ porcji przepisu.
   *
   * Mnożenie przez liczbę porcji NIE należy do tej metody - robi je trasa, tak samo jak
   * `resolveRecipeCalories` robi je poza modelem. Dzięki temu wynik dla ułamkowej liczby porcji
   * da się sprawdzić bez wywołania dostawcy.
   *
   * @param recipeContent - Treść przepisu należącego do tego użytkownika
   * @param entryNote - Pole `content` wpisu, przekazane jako notatka korygująca przepis, a nie
   *   jako opis dania. Bywa samym tytułem przepisu - wtedy wiadomość systemowa każe je zignorować.
   * @param logContext - Kontekst żądania doklejany do linii logu - jak w `estimateFromDescription`.
   * @returns Liczba całkowita z przedziału 0-5000 dla jednej porcji albo `null`, gdy odpowiedź
   *   modelu jest bezużyteczna.
   * @throws {OpenRouterError} Gdy dostawca jest nieosiągalny albo odmówił - dokładnie jak
   *   `estimateFromDescription`, bo trasa buduje z tego jedno 502 dla obu gałęzi.
   */
  async estimateFromRecipe(
    recipeContent: string,
    entryNote: string | null,
    logContext: LogContext = {}
  ): Promise<number | null> {
    const userMessage = [`Treść przepisu:\n${recipeContent}`, `Notatka użytkownika: ${entryNote ?? "brak"}`].join(
      "\n\n"
    );

    const response = await this.openRouterService.sendMessage(userMessage, RECIPE_SYSTEM_MESSAGE);

    return this.extractCalories(response, logContext);
  }

  /**
   * Wydobywa liczbę z surowej koperty OpenAI.
   *
   * Schemat sam z siebie liczby nie gwarantuje: `processResponse` (`validateChatEnvelope`
   * w `openrouter.errors.ts`) sprawdza tylko kopertę - pole `error` i obecność `choices` - a nie
   * treść wiadomości, a `response_format` idzie na wyjściu jako `{ type: "json_object", schema }`
   * (`openrouter.service.ts`) - kształt, którego OpenRouter nie egzekwuje.
   * Model jest przy tym rozumujący, więc treść bywa poprzedzona preambułą i owinięta w ogrodzenia
   * markdown. `AIService` rozwiązuje to samo trzema prywatnymi metodami zaszytymi pod kształt
   * przepisu - nie ma czego zaimportować, więc te kilkanaście linii jest tu świadomie zdublowane.
   *
   * Każdy krok, który się nie uda, kończy się `null` - czyli "odpowiedź bezużyteczna", nie awarią
   * dostawcy - i linią logu z powodem. Linia niesie długość treści, nigdy samą treść: odpowiedź
   * modelu potrafi cytować opis posiłku, a ten nie wychodzi do logu.
   */
  private extractCalories(response: ChatResponse, logContext: LogContext): number | null {
    const choice = response?.choices?.[0];
    const rawContent = choice?.message?.content;

    const diagnostics: LogContext = {
      ...logContext,
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
      model: typeof response?.model === "string" ? response.model : undefined,
      contentLength: typeof rawContent === "string" ? rawContent.length : 0,
    };

    const unusable = (reason: UnusableReason): null => {
      logWarn("estimate.unusable_response", { ...diagnostics, reason });
      return null;
    };

    if (typeof rawContent !== "string" || rawContent.trim() === "") {
      return unusable("empty");
    }

    // Najpierw ogrodzenie ```json ... ```, potem ostatni obiekt w treści: przy modelu rozumującym
    // pierwszy `{...}` bywa fragmentem rozważań, a wynik końcowy stoi na końcu.
    const fenced = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    let candidate: string | null = fenced ? fenced[1] : null;

    if (!candidate) {
      const objects = rawContent.match(/\{[\s\S]*?\}/g);
      candidate = objects && objects.length > 0 ? objects[objects.length - 1] : null;
    }

    if (!candidate) {
      return unusable("no_json");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return unusable("invalid_json");
    }

    if (typeof parsed !== "object" || parsed === null || !("calories" in parsed)) {
      return unusable("no_field");
    }

    const value = (parsed as { calories: unknown }).calories;

    // `{"calories": null}` to odpowiedź, którą prompt wprost każe dać przy opisie nie do wyceny -
    // info, nie warn, żeby kanał ostrzeżeń zostawił miejsce na prawdziwe usterki modelu.
    if (value === null) {
      logInfo("estimate.unusable_response", { ...diagnostics, reason: "model_declined" });
      return null;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return unusable("not_number");
    }

    const rounded = Math.round(value);

    if (rounded < MIN_CALORIES || rounded > MAX_CALORIES) {
      return unusable("out_of_range");
    }

    return rounded;
  }
}
