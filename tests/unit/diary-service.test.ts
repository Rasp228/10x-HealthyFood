import { DiaryService } from "@/lib/services/diary.service";
import type { CreateDiaryEntryCommand, DiaryEntryDto } from "@/types";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface QueryResponse {
  data: unknown;
  error: unknown;
  count?: number | null;
}

interface QueryBuilderStub extends PromiseLike<QueryResponse> {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  eq: jest.Mock;
  is: jest.Mock;
  order: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
}

interface SupabaseStub {
  client: SupabaseClient<Database>;
  from: jest.Mock;
  builder: QueryBuilderStub;
}

/**
 * Atrapa klienta Supabase w stylu `tests/mocks/supabase.mock.ts`: każde ogniwo łańcucha wraca
 * do tego samego obiektu, dzięki czemu test może sprawdzić, z czym zostało zawołane.
 *
 * Jedna różnica wobec wspólnego mocka jest konieczna: `getEntriesForDay` nie kończy łańcucha
 * `.single()`, tylko awaituje wynik `.order()`. Dlatego builder jest „thenable” - bez tego
 * `await` na łańcuchu nigdy by się nie rozwiązał.
 *
 * Odpowiedzi podaje się listą, bo warunkowy zapis to **dwa** zapytania na jedno wywołanie:
 * nietrafiony `UPDATE`, a po nim `SELECT` rozstrzygający, czy wpis w ogóle istnieje. Kolejne
 * zakończenia łańcucha zdejmują kolejne odpowiedzi; ostatnia zostaje i powtarza się w nieskończoność,
 * więc wywołanie z jedną odpowiedzią zachowuje się dokładnie jak przedtem.
 */
function createSupabaseStub(...responses: QueryResponse[]): SupabaseStub {
  const queue = [...responses];
  const nextResponse = (): QueryResponse => (queue.length > 1 ? (queue.shift() as QueryResponse) : queue[0]);

  // Adnotacja jest konieczna, nie ozdobna: pola literału odwołują się do `builder`, więc bez
  // niej TypeScript zgłosiłby cykliczne wnioskowanie typu.
  const builder: QueryBuilderStub = {
    select: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    order: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(nextResponse())),
    maybeSingle: jest.fn(() => Promise.resolve(nextResponse())),
    then: (onfulfilled?: ((value: QueryResponse) => unknown) | null) =>
      Promise.resolve(nextResponse()).then(onfulfilled),
  } as unknown as QueryBuilderStub;

  const from = jest.fn(() => builder);

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    from,
    builder,
  };
}

const storedEntry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto => ({
  id: 1,
  user_id: "user-1",
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: null,
  calories: null,
  calorie_origin: null,
  estimation_requested_at: null,
  portions: null,
  source_recipe_id: null,
  created_at: "2026-09-23T07:00:00.000Z",
  updated_at: "2026-09-23T07:00:00.000Z",
  ...overrides,
});

const BASE_COMMAND: CreateDiaryEntryCommand = {
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: "1 talerz",
  calories: 450,
};

/** Ładunek przekazany do `insert`, odczytany z atrapy. */
const insertPayload = (stub: SupabaseStub): Record<string, unknown> =>
  stub.builder.insert.mock.calls[0][0] as Record<string, unknown>;

/** Ładunek przekazany do `update`, odczytany z atrapy. */
const updatePayload = (stub: SupabaseStub): Record<string, unknown> =>
  stub.builder.update.mock.calls[0][0] as Record<string, unknown>;

/** Błąd, którym supabase-js zgłasza „`.single()` nie trafiło w żaden wiersz". */
const NO_ROWS_ERROR = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };

describe("DiaryService", () => {
  describe("createEntry", () => {
    it("zapisuje wpis do tabeli diary_entries", async () => {
      const stub = createSupabaseStub({ data: storedEntry({ calories: 450, calorie_origin: "manual" }), error: null });

      await new DiaryService(stub.client).createEntry("user-1", BASE_COMMAND);

      expect(stub.from).toHaveBeenCalledWith("diary_entries");
    });

    it("dokłada calorie_origin 'manual' do wpisu z liczbą", async () => {
      const stub = createSupabaseStub({ data: storedEntry({ calories: 450, calorie_origin: "manual" }), error: null });

      await new DiaryService(stub.client).createEntry("user-1", BASE_COMMAND);

      expect(insertPayload(stub)).toMatchObject({
        calories: 450,
        calorie_origin: "manual",
      });
    });

    it("zapisuje null w obu kolumnach, gdy wpis nie ma wartości", async () => {
      const stub = createSupabaseStub({ data: storedEntry(), error: null });

      await new DiaryService(stub.client).createEntry("user-1", { ...BASE_COMMAND, calories: null });

      expect(insertPayload(stub)).toMatchObject({
        calories: null,
        calorie_origin: null,
      });
    });

    it("traktuje zero jako wartość, nie jako jej brak", async () => {
      const stub = createSupabaseStub({ data: storedEntry({ calories: 0, calorie_origin: "manual" }), error: null });

      await new DiaryService(stub.client).createEntry("user-1", { ...BASE_COMMAND, calories: 0 });

      expect(insertPayload(stub)).toMatchObject({
        calories: 0,
        calorie_origin: "manual",
      });
    });

    it("nie bierze pochodzenia od wołającego", async () => {
      const stub = createSupabaseStub({ data: storedEntry({ calories: 450, calorie_origin: "manual" }), error: null });
      // Pochodzenie podane przez klienta - route go nie przepuści, ale serwis i tak nie ma prawa
      // go użyć: ręcznie wpisana liczba trafiłaby do bazy jako oszacowanie AI.
      const command = { ...BASE_COMMAND, calorie_origin: "ai_from_recipe" } as CreateDiaryEntryCommand;

      await new DiaryService(stub.client).createEntry("user-1", command);

      expect(insertPayload(stub).calorie_origin).toBe("manual");
    });

    it("bierze user_id z argumentu, a nie z danych wpisu", async () => {
      const stub = createSupabaseStub({ data: storedEntry({ user_id: "user-z-argumentu" }), error: null });
      const command = { ...BASE_COMMAND, user_id: "user-z-ladunku" } as CreateDiaryEntryCommand;

      await new DiaryService(stub.client).createEntry("user-z-argumentu", command);

      expect(insertPayload(stub).user_id).toBe("user-z-argumentu");
    });

    it("nie dotyka estimation_requested_at - ten wpis niczego nie zleca", async () => {
      const stub = createSupabaseStub({ data: storedEntry(), error: null });

      await new DiaryService(stub.client).createEntry("user-1", BASE_COMMAND);

      expect(insertPayload(stub)).not.toHaveProperty("estimation_requested_at");
    });

    it("zwraca zapisany wiersz", async () => {
      const saved = storedEntry({ id: 42, calories: 450, calorie_origin: "manual" });
      const stub = createSupabaseStub({ data: saved, error: null });

      const result = await new DiaryService(stub.client).createEntry("user-1", BASE_COMMAND);

      expect(result).toEqual(saved);
    });

    it("przepuszcza błąd bazy zamiast zwracać pusty wynik", async () => {
      const stub = createSupabaseStub({ data: null, error: new Error("naruszenie ograniczenia") });

      await expect(new DiaryService(stub.client).createEntry("user-1", BASE_COMMAND)).rejects.toThrow(
        "naruszenie ograniczenia"
      );
    });
  });

  describe("getEntriesForDay", () => {
    it("filtruje po user_id i po entry_date", async () => {
      const stub = createSupabaseStub({ data: [], error: null, count: 0 });

      await new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23");

      expect(stub.builder.eq).toHaveBeenCalledWith("user_id", "user-1");
      expect(stub.builder.eq).toHaveBeenCalledWith("entry_date", "2026-09-23");
      expect(stub.builder.eq).toHaveBeenCalledTimes(2);
    });

    it("czyta z tabeli diary_entries z dokładnym licznikiem wierszy", async () => {
      const stub = createSupabaseStub({ data: [], error: null, count: 0 });

      await new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23");

      expect(stub.from).toHaveBeenCalledWith("diary_entries");
      expect(stub.builder.select).toHaveBeenCalledWith("*", { count: "exact" });
    });

    it("porządkuje dzień po created_at, a remisy po id", async () => {
      const stub = createSupabaseStub({ data: [], error: null, count: 0 });

      await new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23");

      expect(stub.builder.order.mock.calls).toEqual([
        ["created_at", { ascending: true }],
        ["id", { ascending: true }],
      ]);
    });

    it("zwraca wiersze razem z ich liczbą", async () => {
      const entries = [storedEntry({ id: 1 }), storedEntry({ id: 2, calories: 300, calorie_origin: "manual" })];
      const stub = createSupabaseStub({ data: entries, error: null, count: 2 });

      const result = await new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23");

      expect(result).toEqual({ data: entries, total: 2 });
    });

    it("zamienia brak danych na pusty dzień", async () => {
      const stub = createSupabaseStub({ data: null, error: null, count: null });

      const result = await new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23");

      expect(result).toEqual({ data: [], total: 0 });
    });

    it("przepuszcza błąd bazy", async () => {
      const stub = createSupabaseStub({ data: null, error: new Error("RLS odrzuciło zapytanie") });

      await expect(new DiaryService(stub.client).getEntriesForDay("user-1", "2026-09-23")).rejects.toThrow(
        "RLS odrzuciło zapytanie"
      );
    });
  });

  describe("markEstimationRequested", () => {
    const stamped = storedEntry({ estimation_requested_at: "2026-09-23T08:00:00.000Z" });

    it("stempluje znacznik i zwraca ostemplowany wiersz", async () => {
      const stub = createSupabaseStub({ data: stamped, error: null });

      const result = await new DiaryService(stub.client).markEstimationRequested("user-1", 1);

      expect(stub.from).toHaveBeenCalledWith("diary_entries");
      expect(updatePayload(stub).estimation_requested_at).toEqual(expect.any(String));
      expect(result).toEqual(stamped);
    });

    it("zapisuje warunkowo - znacznik należy się wyłącznie wpisowi bez wartości", async () => {
      const stub = createSupabaseStub({ data: stamped, error: null });

      await new DiaryService(stub.client).markEstimationRequested("user-1", 1);

      expect(stub.builder.is).toHaveBeenCalledWith("calories", null);
    });

    it("filtruje po id i po user_id, niezależnie od RLS", async () => {
      const stub = createSupabaseStub({ data: stamped, error: null });

      await new DiaryService(stub.client).markEstimationRequested("user-1", 1);

      expect(stub.builder.eq).toHaveBeenCalledWith("id", 1);
      expect(stub.builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("kończy warunkowy UPDATE przez maybeSingle, nigdy przez single", async () => {
      const stub = createSupabaseStub({ data: stamped, error: null });

      await new DiaryService(stub.client).markEstimationRequested("user-1", 1);

      expect(stub.builder.maybeSingle).toHaveBeenCalled();
      expect(stub.builder.single).not.toHaveBeenCalled();
    });

    it("nie rzuca, gdy UPDATE nie trafia w żaden wiersz - to nie jest błąd", async () => {
      // Zero trafionych wierszy przychodzi jako `data: null, error: null`. To ten sam warunek,
      // co „wartość ręczna zdążyła wcześniej", i nie wolno mu kończyć się wyjątkiem.
      const valued = storedEntry({ calories: 450, calorie_origin: "manual" });
      const stub = createSupabaseStub({ data: null, error: null }, { data: valued, error: null });

      await expect(new DiaryService(stub.client).markEstimationRequested("user-1", 1)).resolves.toEqual(valued);
    });

    it("po nietrafionym zapisie dopytuje o wiersz osobnym odczytem", async () => {
      const valued = storedEntry({ calories: 450, calorie_origin: "manual" });
      const stub = createSupabaseStub({ data: null, error: null }, { data: valued, error: null });

      await new DiaryService(stub.client).markEstimationRequested("user-1", 1);

      expect(stub.builder.maybeSingle).toHaveBeenCalledTimes(2);
    });

    it("zwraca null dla cudzego albo nieistniejącego wpisu", async () => {
      const stub = createSupabaseStub({ data: null, error: null }, { data: null, error: null });

      const result = await new DiaryService(stub.client).markEstimationRequested("user-1", 999);

      expect(result).toBeNull();
    });

    it("przepuszcza błąd bazy", async () => {
      const stub = createSupabaseStub({ data: null, error: new Error("RLS odrzuciło zapis") });

      await expect(new DiaryService(stub.client).markEstimationRequested("user-1", 1)).rejects.toThrow(
        "RLS odrzuciło zapis"
      );
    });
  });

  describe("applyEstimate", () => {
    const estimated = storedEntry({ calories: 320, calorie_origin: "ai_from_description" });

    it("ustawia calorie_origin 'ai_from_description' razem z liczbą", async () => {
      const stub = createSupabaseStub({ data: estimated, error: null });

      await new DiaryService(stub.client).applyEstimate("user-1", 1, 320);

      expect(updatePayload(stub)).toMatchObject({
        calories: 320,
        calorie_origin: "ai_from_description",
      });
    });

    it("zapisuje warunkowo, więc spóźnione oszacowanie nie nadpisze liczby wpisanej ręcznie", async () => {
      const stub = createSupabaseStub({ data: estimated, error: null });

      await new DiaryService(stub.client).applyEstimate("user-1", 1, 320);

      expect(stub.builder.is).toHaveBeenCalledWith("calories", null);
      expect(stub.builder.maybeSingle).toHaveBeenCalled();
      expect(stub.builder.single).not.toHaveBeenCalled();
    });

    it("nie dotyka estimation_requested_at", async () => {
      const stub = createSupabaseStub({ data: estimated, error: null });

      await new DiaryService(stub.client).applyEstimate("user-1", 1, 320);

      expect(updatePayload(stub)).not.toHaveProperty("estimation_requested_at");
    });

    it("filtruje po id i po user_id", async () => {
      const stub = createSupabaseStub({ data: estimated, error: null });

      await new DiaryService(stub.client).applyEstimate("user-1", 1, 320);

      expect(stub.builder.eq).toHaveBeenCalledWith("id", 1);
      expect(stub.builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("gdy wartość już jest, zwraca stan faktyczny wiersza zamiast rzucać", async () => {
      const manual = storedEntry({ calories: 450, calorie_origin: "manual" });
      const stub = createSupabaseStub({ data: null, error: null }, { data: manual, error: null });

      const result = await new DiaryService(stub.client).applyEstimate("user-1", 1, 320);

      expect(result).toEqual(manual);
    });

    it("zwraca null dla cudzego albo nieistniejącego wpisu", async () => {
      const stub = createSupabaseStub({ data: null, error: null }, { data: null, error: null });

      const result = await new DiaryService(stub.client).applyEstimate("user-1", 999, 320);

      expect(result).toBeNull();
    });

    it("przepuszcza błąd bazy", async () => {
      const stub = createSupabaseStub({ data: null, error: new Error("naruszenie ograniczenia") });

      await expect(new DiaryService(stub.client).applyEstimate("user-1", 1, 320)).rejects.toThrow(
        "naruszenie ograniczenia"
      );
    });
  });

  describe("setCaloriesManually", () => {
    const manual = storedEntry({ calories: 450, calorie_origin: "manual" });

    it("ustawia calorie_origin 'manual' razem z liczbą", async () => {
      const stub = createSupabaseStub({ data: manual, error: null });

      const result = await new DiaryService(stub.client).setCaloriesManually("user-1", 1, 450);

      expect(updatePayload(stub)).toMatchObject({
        calories: 450,
        calorie_origin: "manual",
      });
      expect(result).toEqual(manual);
    });

    it("zapisuje bezwarunkowo - człowiek nadpisuje oszacowanie", async () => {
      const stub = createSupabaseStub({ data: manual, error: null });

      await new DiaryService(stub.client).setCaloriesManually("user-1", 1, 450);

      expect(stub.builder.is).not.toHaveBeenCalled();
    });

    it("nie dotyka estimation_requested_at - wpisanie liczby nie unieważnia faktu zlecenia", async () => {
      const stub = createSupabaseStub({ data: manual, error: null });

      await new DiaryService(stub.client).setCaloriesManually("user-1", 1, 450);

      expect(updatePayload(stub)).not.toHaveProperty("estimation_requested_at");
    });

    it("filtruje po id i po user_id", async () => {
      const stub = createSupabaseStub({ data: manual, error: null });

      await new DiaryService(stub.client).setCaloriesManually("user-1", 1, 450);

      expect(stub.builder.eq).toHaveBeenCalledWith("id", 1);
      expect(stub.builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    });

    it("zwraca null dla cudzego wpisu - brak wiersza znaczy tu dokładnie jedno", async () => {
      const stub = createSupabaseStub({ data: null, error: NO_ROWS_ERROR });

      const result = await new DiaryService(stub.client).setCaloriesManually("user-1", 999, 450);

      expect(result).toBeNull();
    });

    it("przepuszcza błąd bazy inny niż brak wiersza", async () => {
      const stub = createSupabaseStub({ data: null, error: new Error("naruszenie ograniczenia") });

      await expect(new DiaryService(stub.client).setCaloriesManually("user-1", 1, 450)).rejects.toThrow(
        "naruszenie ograniczenia"
      );
    });
  });
});
