/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza
 * (`ReferenceError: Response is not defined` przy pierwszym `return`). Kod trasy i tak biegnie
 * w produkcji po stronie serwera, więc node jest tu środowiskiem wierniejszym, a nie obejściem.
 */

import { DiaryService, RecipeNotFoundError } from "@/lib/services/diary.service";
import { CalorieEstimationService } from "@/lib/services/calorie-estimation.service";
import { OpenRouterError, RateLimitError } from "@/lib/api/openrouter.types";
import { POST } from "@/pages/api/diary-entries/[id]/estimate";
import type { DiaryEntryDto } from "@/types";

/**
 * Serwis modelu jest zamockowany w całości, tak samo jak w `calorie-estimation.service.test.ts`
 * i z tego samego podwójnego powodu: suita nie płaci za wywołania dostawcy, a moduł, który go
 * opakowuje, czyta `import.meta.env` - pod ts-jest (CommonJS) sam jego import wywróciłby plik.
 *
 * Fabryka nie sięga po nic spoza swojego zakresu, bo `jest.mock` jest wynoszony ponad importy.
 */
jest.mock("@/lib/services/calorie-estimation.service", () => ({
  CalorieEstimationService: jest.fn(),
}));

const CalorieEstimationServiceMock = CalorieEstimationService as unknown as jest.Mock;

const estimateFromDescription = jest.fn();
const estimateFromRecipe = jest.fn();

/**
 * `DiaryService` zostaje prawdziwy, a podmieniane są wyłącznie jego metody.
 *
 * Dzięki temu `RecipeNotFoundError` łapany w trasie jest tą samą klasą, którą serwis rzuca
 * w produkcji - z atrapą całego modułu `instanceof` sprawdzałby dwa różne byty i gałąź
 * „usunięty przepis schodzi na opis" przechodziłaby testem, którego w produkcji by nie było.
 */
const markEstimationRequested = jest.spyOn(DiaryService.prototype, "markEstimationRequested");
const readOwnRecipeContent = jest.spyOn(DiaryService.prototype, "readOwnRecipeContent");
const applyEstimate = jest.spyOn(DiaryService.prototype, "applyEstimate");
const getEntry = jest.spyOn(DiaryService.prototype, "getEntry");

const getUser = jest.fn();

/**
 * Kontekst żądania w kształcie, którego trasa faktycznie dotyka: `params.id`, klient z `locals`
 * i - gdy test go podaje - `requestId` ustawiany przez middleware.
 */
const requestContext = (id = "1", requestId?: string) =>
  ({
    params: { id },
    locals: { supabase: { auth: { getUser } }, requestId },
  }) as unknown as Parameters<typeof POST>[0];

/** Sparsowane linie JSON wypisane przez szpiega konsoli. */
const logLines = (spy: jest.SpyInstance): Record<string, unknown>[] =>
  spy.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);

/** Pierwsza linia logu o podanym zdarzeniu albo `undefined`. */
const lineFor = (spy: jest.SpyInstance, event: string): Record<string, unknown> | undefined =>
  logLines(spy).find((line) => line.event === event);

/**
 * Trasa zostawia linie `estimate.completed` i ostrzeżenia przy każdym przebiegu. Wyciszone
 * w `beforeEach`, bo `jest.setup.ts` podmienia `console.warn` w `beforeAll` - szpieg założony
 * na poziomie modułu patrzyłby na funkcję, której nikt już nie woła.
 */
let consoleWarn: jest.SpyInstance;
let consoleInfo: jest.SpyInstance;

const storedEntry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto => ({
  id: 1,
  user_id: "user-1",
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: null,
  calories: null,
  calorie_origin: null,
  estimation_requested_at: "2026-09-23T08:00:00.000Z",
  portions: null,
  source_recipe_id: null,
  created_at: "2026-09-23T07:00:00.000Z",
  updated_at: "2026-09-23T08:00:00.000Z",
  ...overrides,
});

/** Wpis utworzony z własnego przepisu: ilość opisuje liczba porcji, nie tekst. */
const recipeEntry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto =>
  storedEntry({ source_recipe_id: 7, portions: 2, ...overrides });

const RECIPE_CONTENT = "Składniki:\n- 100 g płatków owsianych\n\nPrzygotowanie:\n1. Zagotuj mleko";

/** Wartość, z jaką trasa zawołała zapis - czyli liczba, która wejdzie w sumę dnia. */
const savedCalories = (): number => applyEstimate.mock.calls[0][2];

/** Pochodzenie, z jakim trasa zawołała zapis. */
const savedOrigin = (): string => applyEstimate.mock.calls[0][3];

beforeEach(() => {
  jest.clearAllMocks();

  CalorieEstimationServiceMock.mockImplementation(() => ({ estimateFromDescription, estimateFromRecipe }));
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  // Atrapa trzyma się kontraktu prawdziwej metody: `null` dla wpisu bez przepisu, treść dla wpisu
  // z przepisem. Stała odpowiedź kierowałaby na gałąź przepisową także wpis opisowy.
  readOwnRecipeContent.mockImplementation(async (_userId, recipeId) => (recipeId === null ? null : RECIPE_CONTENT));
  applyEstimate.mockImplementation(async (_userId, _entryId, calories, origin) =>
    storedEntry({ calories, calorie_origin: origin })
  );
  getEntry.mockResolvedValue(storedEntry());
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  consoleInfo = jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
  consoleInfo.mockRestore();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("POST /api/diary-entries/[id]/estimate", () => {
  describe("gałąź przepisowa", () => {
    it("mnoży wartość jednej porcji przez liczbę porcji i zapisuje pochodzenie 'ai_from_recipe'", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry({ portions: 2 }));
      estimateFromRecipe.mockResolvedValue(250);

      const response = await POST(requestContext());

      expect(response.status).toBe(200);
      expect(savedCalories()).toBe(500);
      expect(savedOrigin()).toBe("ai_from_recipe");
    });

    it("przekazuje modelowi treść przepisu, a opis wpisu jako notatkę użytkownika", async () => {
      // Pole `content` wpisu zostaje otwarte po zapisie, więc to jedyne miejsce, w którym może
      // stać poprawka użytkownika („bez sera"). Kolejność argumentów przypina, że idzie ono jako
      // notatka korygująca przepis, a nie jako opis dania.
      markEstimationRequested.mockResolvedValue(recipeEntry({ content: "Owsianka bez cukru" }));
      estimateFromRecipe.mockResolvedValue(250);

      await POST(requestContext());

      expect(estimateFromRecipe).toHaveBeenCalledWith(RECIPE_CONTENT, "Owsianka bez cukru", expect.any(Object));
      expect(estimateFromDescription).not.toHaveBeenCalled();
    });

    it("jedna porcja zapisuje wartość jednej porcji bez zmian", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry({ portions: 1 }));
      estimateFromRecipe.mockResolvedValue(250);

      await POST(requestContext());

      expect(savedCalories()).toBe(250);
      expect(savedOrigin()).toBe("ai_from_recipe");
    });

    it("liczy jedną porcję dla wpisu, który liczby porcji nie ma", async () => {
      // `portions` potrafi być puste mimo niezerowego `source_recipe_id` - baza tej pary nie
      // pilnuje. Bez `?? 1` iloczyn byłby w JS `0`, nie `NaN` - przeszedłby bramkę zakresu
      // i ograniczenie bazy, a wpis po cichu dostałby 0 kcal z etykietą „oszacowane z przepisu".
      markEstimationRequested.mockResolvedValue(recipeEntry({ portions: null }));
      estimateFromRecipe.mockResolvedValue(250);

      await POST(requestContext());

      expect(savedCalories()).toBe(250);
    });

    it("zaokrągla iloczyn dla ułamkowej liczby porcji", async () => {
      // 333 kcal na porcję razy 1,5 porcji to 499,5 - do bazy idzie liczba całkowita.
      markEstimationRequested.mockResolvedValue(recipeEntry({ portions: 1.5 }));
      estimateFromRecipe.mockResolvedValue(333);

      await POST(requestContext());

      expect(savedCalories()).toBe(500);
    });

    it("iloczyn ponad 5000 kcal nie dojeżdża do zapisu - wpis zostaje bez wartości", async () => {
      // Granica z `caloriesValueSchema` nakłada się na iloczyn drugi raz, bo serwis modelu
      // pilnuje wyłącznie wartości JEDNEJ porcji. Gdyby przeszła, wpis dostałby 6000 kcal
      // z etykietą „oszacowane z przepisu", której suma dnia nie ma jak zakwestionować.
      const entry = recipeEntry({ portions: 2 });
      markEstimationRequested.mockResolvedValue(entry);
      estimateFromRecipe.mockResolvedValue(3000);
      getEntry.mockResolvedValue(entry);

      const response = await POST(requestContext());

      expect(applyEstimate).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ calories: null, calorie_origin: null });
    });

    it("odpowiedź modelu bez liczby zostawia wpis bez wartości, a nie zeruje go błędem", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry());
      estimateFromRecipe.mockResolvedValue(null);

      const response = await POST(requestContext());

      expect(applyEstimate).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe("wybór gałęzi", () => {
    it("przekazuje do zapisu znacznik z kroku stemplowania, żeby unieważnione zlecenie nie trafiło", async () => {
      markEstimationRequested.mockResolvedValue(
        storedEntry({ estimation_requested_at: "2026-09-29T10:00:00.123+00:00" })
      );
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(applyEstimate.mock.calls[0][4]).toBe("2026-09-29T10:00:00.123+00:00");
    });

    it("wpis bez przepisu idzie gałęzią opisową, dokładnie jak przed zmianą", async () => {
      markEstimationRequested.mockResolvedValue(storedEntry({ content: "frytki", amount_text: "około 200 g" }));
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(estimateFromDescription).toHaveBeenCalledWith("frytki", "około 200 g", expect.any(Object));
      expect(estimateFromRecipe).not.toHaveBeenCalled();
      expect(savedCalories()).toBe(420);
      expect(savedOrigin()).toBe("ai_from_description");
    });

    it("nie mnoży wartości opisowej przez liczbę porcji wiersza po usuniętym przepisie", async () => {
      // Wiersz-sierota: `portions` przeżywa usunięcie przepisu (`on delete set null`), ale bez
      // `source_recipe_id` nie ma czego mnożyć - wartość dotyczy całego opisanego posiłku.
      markEstimationRequested.mockResolvedValue(storedEntry({ portions: 2, source_recipe_id: null }));
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(savedCalories()).toBe(420);
      expect(savedOrigin()).toBe("ai_from_description");
    });

    it("sierota wysyła do modelu swoje porcje jako ilość", async () => {
      // Sierota nie ma tekstu ilości - bez tego model wyceniłby jedną porcję, a wiersz
      // pokazywałby „2 porcje" obok wartości dla jednej.
      markEstimationRequested.mockResolvedValue(
        storedEntry({ content: "Owsianka", portions: 2, source_recipe_id: null, amount_text: null })
      );
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(estimateFromDescription).toHaveBeenCalledWith("Owsianka", "2 porcje", expect.any(Object));
    });

    it("zwykły wpis opisowy dalej wysyła amount_text, także pusty", async () => {
      markEstimationRequested.mockResolvedValue(storedEntry({ content: "frytki", amount_text: null }));
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(estimateFromDescription).toHaveBeenCalledWith("frytki", null, expect.any(Object));
    });

    it("usunięty albo cudzy przepis schodzi na gałąź opisową, a nie na 404", async () => {
      // Wpis istnieje - brakuje wyłącznie przepisu. 404 kłamałoby o wpisie, którego użytkownik
      // ma przed oczami.
      markEstimationRequested.mockResolvedValue(recipeEntry({ content: "Owsianka z bananem" }));
      readOwnRecipeContent.mockRejectedValue(new RecipeNotFoundError());
      estimateFromDescription.mockResolvedValue(420);

      const response = await POST(requestContext());

      expect(response.status).toBe(200);
      expect(estimateFromRecipe).not.toHaveBeenCalled();
      expect(savedOrigin()).toBe("ai_from_description");
    });

    it("wpis z wartością kończy się bez fatygowania modelu", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry({ calories: 450, calorie_origin: "manual" }));

      const response = await POST(requestContext());

      expect(response.status).toBe(200);
      expect(estimateFromRecipe).not.toHaveBeenCalled();
      expect(estimateFromDescription).not.toHaveBeenCalled();
      expect(applyEstimate).not.toHaveBeenCalled();
    });
  });

  describe("awaria dostawcy", () => {
    it("OpenRouterError z gałęzi przepisowej daje to samo 502 AI_UNAVAILABLE co z opisowej", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockResolvedValue(recipeEntry());
      estimateFromRecipe.mockRejectedValue(new RateLimitError());

      const response = await POST(requestContext());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ code: "AI_UNAVAILABLE" });
      // Wiersz zostaje ze znacznikiem i bez wartości - awaria niczego nie zapisuje.
      expect(applyEstimate).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("OpenRouterError z gałęzi opisowej daje 502 AI_UNAVAILABLE i niczego nie zapisuje", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockResolvedValue(storedEntry({ content: "frytki" }));
      estimateFromDescription.mockRejectedValue(new OpenRouterError("Przekroczono czas oczekiwania"));

      const response = await POST(requestContext());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: "Usługa AI jest chwilowo niedostępna",
        code: "AI_UNAVAILABLE",
      });
      expect(applyEstimate).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("awaria poza dostawcą", () => {
    it("błąd spoza OpenRouterError z serwisu wyceny daje 500 bez treści błędu w ciele", async () => {
      // Tylko awaria dostawcy ma własne 502. Każdy inny rzut schodzi do zewnętrznego catcha, a jego
      // komunikat - tu udający błąd PostgREST z nazwą ograniczenia - zostaje w logu serwera.
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockResolvedValue(storedEntry());
      estimateFromDescription.mockRejectedValue(
        new Error('violates check constraint "diary_entries_value_has_origin"')
      );

      const response = await POST(requestContext());

      expect(response.status).toBe(500);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({ error: "Błąd wewnętrzny serwera" });
      expect(body).not.toContain("diary_entries_value_has_origin");
      expect(applyEstimate).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("błąd stemplowania daje 500 i model nie zostaje zawołany", async () => {
      // Znacznik idzie do bazy PRZED modelem. Gdy ten zapis padnie, nie ma czego wyceniać -
      // wywołanie modelu byłoby opłacone i wyrzucone.
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockRejectedValue(new Error("RLS odrzuciło zapis"));

      const response = await POST(requestContext());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera" });
      expect(CalorieEstimationServiceMock).not.toHaveBeenCalled();
      expect(estimateFromDescription).not.toHaveBeenCalled();
      expect(estimateFromRecipe).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
  describe("logi wyceny", () => {
    it("przekazuje serwisowi kontekst żądania: requestId, userId, entryId, gałąź i trasę", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry());
      estimateFromRecipe.mockResolvedValue(250);

      await POST(requestContext("1", "req-1"));

      expect(estimateFromRecipe.mock.calls[0][2]).toMatchObject({
        requestId: "req-1",
        userId: "user-1",
        entryId: 1,
        branch: "ai_from_recipe",
        route: "diary.estimate",
      });
    });

    it("udana wycena zostawia estimate.completed z czasem i wynikiem valued", async () => {
      markEstimationRequested.mockResolvedValue(storedEntry());
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext("1", "req-1"));

      const line = lineFor(consoleInfo, "estimate.completed");
      expect(line).toMatchObject({ requestId: "req-1", branch: "ai_from_description", result: "valued" });
      expect(typeof line?.ms).toBe("number");
    });

    it("odpowiedź bez liczby zostawia estimate.completed z wynikiem empty", async () => {
      markEstimationRequested.mockResolvedValue(storedEntry());
      estimateFromDescription.mockResolvedValue(null);

      await POST(requestContext());

      expect(lineFor(consoleInfo, "estimate.completed")).toMatchObject({ result: "empty" });
    });

    it("iloczyn ponad 5000 kcal zostawia warn estimate.total_out_of_range z wartością porcji i porcjami", async () => {
      const entry = recipeEntry({ portions: 2 });
      markEstimationRequested.mockResolvedValue(entry);
      estimateFromRecipe.mockResolvedValue(3000);
      getEntry.mockResolvedValue(entry);

      await POST(requestContext());

      expect(lineFor(consoleWarn, "estimate.total_out_of_range")).toMatchObject({
        level: "warn",
        perPortion: 3000,
        portions: 2,
        branch: "ai_from_recipe",
      });
    });

    it("zapis odcięty znacznikiem zostawia warn estimate.discarded_stale ze znacznikiem zlecenia", async () => {
      // `applyEstimate` oddaje wiersz bez wartości: w międzyczasie ktoś unieważnił zlecenie.
      markEstimationRequested.mockResolvedValue(storedEntry({ estimation_requested_at: "2026-09-29T10:00:00.000Z" }));
      estimateFromDescription.mockResolvedValue(420);
      applyEstimate.mockResolvedValue(storedEntry({ calories: null, estimation_requested_at: null }));

      const response = await POST(requestContext());

      expect(response.status).toBe(200);
      expect(lineFor(consoleWarn, "estimate.discarded_stale")).toMatchObject({
        requestedAt: "2026-09-29T10:00:00.000Z",
        entryId: 1,
      });
    });

    it("zapisana wartość nie zostawia ostrzeżenia o odciętym zapisie", async () => {
      markEstimationRequested.mockResolvedValue(storedEntry());
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext());

      expect(lineFor(consoleWarn, "estimate.discarded_stale")).toBeUndefined();
    });

    it("usunięty przepis zostawia info estimate.recipe_missing_fallback przy przełączeniu na opis", async () => {
      markEstimationRequested.mockResolvedValue(recipeEntry({ source_recipe_id: 7 }));
      readOwnRecipeContent.mockRejectedValue(new RecipeNotFoundError());
      estimateFromDescription.mockResolvedValue(420);

      await POST(requestContext("1", "req-1"));

      expect(lineFor(consoleInfo, "estimate.recipe_missing_fallback")).toMatchObject({
        level: "info",
        requestId: "req-1",
        entryId: 1,
        recipeId: 7,
      });
    });

    it("awaria dostawcy loguje estimate.provider_failed ze statusem, modelem, gałęzią i czasem", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockResolvedValue(storedEntry());
      estimateFromDescription.mockRejectedValue(new RateLimitError("Limit", { status: 429, model: "model-testowy" }));

      await POST(requestContext("1", "req-1"));

      expect(consoleError).toHaveBeenCalledTimes(1);
      const line = lineFor(consoleError, "estimate.provider_failed");
      expect(line).toMatchObject({
        requestId: "req-1",
        userId: "user-1",
        entryId: 1,
        branch: "ai_from_description",
        route: "diary.estimate",
        status: 429,
        model: "model-testowy",
      });
      expect(typeof line?.ms).toBe("number");
      expect((line?.error as { name: string }).name).toBe("RateLimitError");

      consoleError.mockRestore();
    });

    it("brak klucza (code AI_MISCONFIGURED) daje 502 z tym kodem, a nie AI_UNAVAILABLE", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockResolvedValue(storedEntry());
      CalorieEstimationServiceMock.mockImplementation(() => {
        throw new OpenRouterError("Konfiguracja OpenRouter jest niekompletna", { code: "AI_MISCONFIGURED" });
      });

      const response = await POST(requestContext());

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({ code: "AI_MISCONFIGURED" });
      expect(lineFor(consoleError, "estimate.provider_failed")).toBeDefined();
      expect(applyEstimate).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("500 z zewnętrznego catcha oddaje requestId i loguje estimate.failed z tym samym id", async () => {
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
      markEstimationRequested.mockRejectedValue(new Error("RLS odrzuciło zapis"));

      const response = await POST(requestContext("1", "req-1"));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera", requestId: "req-1" });
      expect(lineFor(consoleError, "estimate.failed")).toMatchObject({ requestId: "req-1", entryId: 1 });

      consoleError.mockRestore();
    });
  });
});
