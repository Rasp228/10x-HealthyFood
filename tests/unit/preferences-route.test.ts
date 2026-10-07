/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasy budują `Response`, a jsdom tej klasy nie dostarcza.
 *
 * Ryzyko #6 test-planu dla tras preferencji: każdy twardy limit przepuszcza wartość na granicy
 * i odrzuca o krok dalej z 400 (nie z 500), duplikat daje 409, a przy 400 i 409 nic nie zostaje
 * zapisane. Trasy są prawdziwe; podmieniona jest tylko warstwa bazy
 * (`tests/helpers/supabase-tables.ts`), a brak zapisu to głęboka równość tabeli z migawką.
 *
 * Wyrocznie to literały migracji `supabase/migrations/20250427130913_healthymeal_schema.sql`, nie
 * schemat pod testem:
 * - `value varchar(50) not null check (char_length(value) <= 50)` - granica 50, krok dalej 51;
 * - `constraint preferences_unique_user_category_value unique (user_id, category, value)` - 409;
 * - `id serial` - int4, sufit 2147483647.
 * Trim wartości to decyzja produktowa planu `testing-protected-data-and-limits` (trim, potem 1-50).
 */

import type { APIContext } from "astro";
import { GET as getPreferences, POST as postPreference } from "@/pages/api/preferences/index";
import { PUT as putPreference, DELETE as deletePreference } from "@/pages/api/preferences/[id]";
import { createSupabaseTables, type Row, type TableState } from "../helpers/supabase-tables";

const USER_A = "user-a";
const USER_B = "user-b";

/** Sufit kolumny `value varchar(50)` z migracji - literał, nie wartość odczytana ze schematu. */
const VALUE_MAX = 50;
/** Największa wartość `serial` (int4) - literał typu kolumny `id`. */
const INT4_MAX = 2147483647;

const seed = (): TableState => ({
  preferences: [
    { id: 1, user_id: USER_A, category: "lubiane", value: "owsianka", created_at: "2026-09-01T08:00:00.000Z" },
    { id: 2, user_id: USER_A, category: "diety", value: "wega", created_at: "2026-09-01T08:01:00.000Z" },
    { id: 3, user_id: USER_B, category: "lubiane", value: "banany", created_at: "2026-09-02T08:00:00.000Z" },
  ],
});

/** Odwzorowanie `preferences_unique_user_category_value` z `20250427130913_healthymeal_schema.sql`. */
const UNIQUE = { preferences: [["user_id", "category", "value"]] };

const createDb = (tables: TableState = seed()) => createSupabaseTables({ userId: USER_A, tables, unique: UNIQUE });

type Db = ReturnType<typeof createDb>;
type Supabase = Db["supabase"];

interface ContextInit {
  method: string;
  /** Ciało serializowane do JSON-a. */
  body?: unknown;
  /** Surowe ciało - do przypadku „nie-JSON”. */
  rawBody?: string;
  params?: Record<string, string>;
  search?: string;
}

/** Kontekst żądania w kształcie, którego trasy dotykają: `request`, `params`, `url` i klient z `locals`. */
const context = (supabase: Supabase, init: ContextInit) => {
  const url = `http://localhost/api/preferences${init.search ?? ""}`;
  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));

  return {
    request: new Request(url, { method: init.method, headers: { "Content-Type": "application/json" }, body }),
    params: init.params ?? {},
    url: new URL(url),
    locals: { supabase },
  } as unknown as APIContext;
};

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

let consoleError: jest.SpyInstance;

beforeEach(() => {
  // Trasy logują pełny błąd przy 500 - w testach wyciszone, ale sprawdzane tam, gdzie to kontrakt.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("POST /api/preferences", () => {
  it(`value z ${VALUE_MAX} znaków (granica kolumny) → 201 i zapis`, async () => {
    const db = createDb();
    const value = "a".repeat(VALUE_MAX);

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value } })
    );

    expect(response.status).toBe(201);
    expect(db.tables.preferences).toContainEqual(
      expect.objectContaining({ user_id: USER_A, category: "lubiane", value })
    );
  });

  it.each([
    ["value z 51 znaków (krok za granicą kolumny)", "a".repeat(VALUE_MAX + 1)],
    ["value z samych spacji (po trim pusta)", "   "],
    ["value pusta", ""],
  ])("%s → 400 z details na value, bez zapisu", async (_label, value) => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value } })
    );

    expect(response.status).toBe(400);
    const body = await json(response);
    expect(body.details).toEqual([{ path: "value", message: expect.any(String) }]);
    expect(db.snapshot()).toEqual(before);
  });

  it("nieznana kategoria → 400 z details na category, bez zapisu", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "likes", value: "owsianka" } })
    );

    expect(response.status).toBe(400);
    expect((await json(response)).details).toEqual([{ path: "category", message: expect.any(String) }]);
    expect(db.snapshot()).toEqual(before);
  });

  it('"  wega  " zapisuje się jako "wega"', async () => {
    const db = createDb();

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value: "  wega  " } })
    );

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({ category: "lubiane", value: "wega" });
    const added = db.tables.preferences.filter((row: Row) => row.user_id === USER_A && row.category === "lubiane");
    expect(added.map((row) => row.value)).toEqual(["owsianka", "wega"]);
  });

  it.each([
    ["ta sama wartość", "owsianka"],
    ["ta sama wartość ze spacjami (po trim)", "  owsianka  "],
  ])("duplikat - %s → 409, tabela bez zmian", async (_label, value) => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value } })
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "Taka preferencja już istnieje" });
    expect(db.snapshot()).toEqual(before);
  });

  it("ta sama wartość innego użytkownika nie jest duplikatem → 201", async () => {
    const db = createDb();

    // `banany` w kategorii `lubiane` ma tylko B - unikat obejmuje `user_id`.
    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value: "banany" } })
    );

    expect(response.status).toBe(201);
  });

  it("ciało nie-JSON → 400, bez zapisu", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postPreference(context(db.supabase, { method: "POST", rawBody: "{nie json" }));

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ details: expect.any(Array) });
    expect(db.snapshot()).toEqual(before);
  });

  it("50 istniejących preferencji użytkownika → 400 z dzisiejszym komunikatem, bez zapisu", async () => {
    // Limit 50 wierszy i jego komunikat to dzisiejsze zachowanie trasy - przypięte co do znaku.
    const full: Row[] = Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      user_id: USER_A,
      category: "lubiane",
      value: `wartość ${index + 1}`,
      created_at: "2026-09-01T08:00:00.000Z",
    }));
    const db = createDb({ preferences: full });
    const before = db.snapshot();

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "diety", value: "wega" } })
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: "Osiągnięto maksymalną liczbę preferencji (50)" });
    expect(db.snapshot()).toEqual(before);
  });

  it("awaria bazy przy insercie → 500 ze stałym ciałem, bez treści błędu atrapy", async () => {
    const db = createDb();
    const SECRET = "violates check constraint preferences_value_check on relation preferences";
    const failure = { data: null, error: { code: "XX000", message: SECRET, details: SECRET, hint: SECRET } };

    // Odczyt licznika idzie przez atrapę, a insert kończy się błędem PostgREST z nazwami ograniczeń.
    const failingSupabase = {
      auth: db.supabase.auth,
      from: (table: string) =>
        Object.assign(db.supabase.from(table), {
          insert: () => ({ select: () => ({ single: async () => failure }) }),
        }),
    } as unknown as Supabase;

    const response = await postPreference(
      context(failingSupabase, { method: "POST", body: { category: "diety", value: "keto" } })
    );

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Błąd wewnętrzny serwera" });
    expect(text).not.toContain("constraint");
    // Pełny błąd ląduje w logu serwera.
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure.error);
  });

  it("bez sesji → 401", async () => {
    const db = createSupabaseTables({ userId: null, tables: seed(), unique: UNIQUE });

    const response = await postPreference(
      context(db.supabase, { method: "POST", body: { category: "lubiane", value: "kasza" } })
    );

    expect(response.status).toBe(401);
  });
});

describe("PUT /api/preferences/:id", () => {
  it("value z 50 znaków → 200 i zmiana wiersza", async () => {
    const db = createDb();
    const value = "b".repeat(VALUE_MAX);

    const response = await putPreference(
      context(db.supabase, { method: "PUT", params: { id: "1" }, body: { category: "lubiane", value } })
    );

    expect(response.status).toBe(200);
    expect(db.tables.preferences.find((row) => row.id === 1)).toMatchObject({ value });
  });

  it("value z 51 znaków → 400 z details na value, bez zapisu", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await putPreference(
      context(db.supabase, {
        method: "PUT",
        params: { id: "1" },
        body: { category: "lubiane", value: "b".repeat(VALUE_MAX + 1) },
      })
    );

    expect(response.status).toBe(400);
    expect((await json(response)).details).toEqual([{ path: "value", message: expect.any(String) }]);
    expect(db.snapshot()).toEqual(before);
  });

  it.each(["12abc", "0", String(INT4_MAX + 1)])('id "%s" → 400, bez zapisu', async (id) => {
    const db = createDb();
    const before = db.snapshot();

    const response = await putPreference(
      context(db.supabase, { method: "PUT", params: { id }, body: { category: "lubiane", value: "kasza" } })
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: "Nieprawidłowe ID preferencji", details: expect.any(Array) });
    expect(db.snapshot()).toEqual(before);
  });

  it("ciało nie-JSON → 400, bez zapisu", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await putPreference(
      context(db.supabase, { method: "PUT", params: { id: "1" }, rawBody: "nie json" })
    );

    expect(response.status).toBe(400);
    expect(db.snapshot()).toEqual(before);
  });

  it("cudza preferencja → 404 z ciałem, wiersz B nietknięty", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await putPreference(
      context(db.supabase, { method: "PUT", params: { id: "3" }, body: { category: "lubiane", value: "kasza" } })
    );

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ error: "Nie znaleziono preferencji" });
    expect(db.snapshot()).toEqual(before);
  });

  it("zmiana na parę, którą użytkownik już ma → 409, tabela bez zmian", async () => {
    const db = createDb();
    const before = db.snapshot();

    // Wiersz 2 (`diety` / `wega`) przepisany na istniejącą parę wiersza 1 (`lubiane` / `owsianka`).
    const response = await putPreference(
      context(db.supabase, { method: "PUT", params: { id: "2" }, body: { category: "lubiane", value: " owsianka " } })
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ error: "Taka preferencja już istnieje" });
    expect(db.snapshot()).toEqual(before);
  });
});

describe("GET /api/preferences", () => {
  it("limit=50 → 200", async () => {
    const db = createDb();

    const response = await getPreferences(context(db.supabase, { method: "GET", search: "?limit=50" }));

    expect(response.status).toBe(200);
    // Tylko wiersze A, od najnowszego - kolejność i filtr bez zmian.
    expect(await json(response)).toMatchObject({ total: 2, data: [{ id: 2 }, { id: 1 }] });
  });

  it.each(["51", "-1", "abc", "1.5"])("limit=%s → 400 z details na limit", async (limit) => {
    const db = createDb();

    const response = await getPreferences(context(db.supabase, { method: "GET", search: `?limit=${limit}` }));

    expect(response.status).toBe(400);
    expect((await json(response)).details).toEqual([{ path: "limit", message: expect.any(String) }]);
  });

  it("nieznana kategoria → 400", async () => {
    const db = createDb();

    const response = await getPreferences(context(db.supabase, { method: "GET", search: "?category=likes" }));

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/preferences/:id", () => {
  it.each(["12abc", String(INT4_MAX + 1)])('id "%s" → 400, tabela bez zmian', async (id) => {
    const db = createDb();
    const before = db.snapshot();

    const response = await deletePreference(context(db.supabase, { method: "DELETE", params: { id } }));

    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: "Nieprawidłowe ID preferencji", details: expect.any(Array) });
    expect(db.snapshot()).toEqual(before);
  });

  it(`id ${INT4_MAX} (sufit int4) przechodzi walidację → 404 dla nieistniejącego wiersza`, async () => {
    const db = createDb();

    const response = await deletePreference(
      context(db.supabase, { method: "DELETE", params: { id: String(INT4_MAX) } })
    );

    expect(response.status).toBe(404);
  });

  it("własna preferencja → 204", async () => {
    const db = createDb();

    const response = await deletePreference(context(db.supabase, { method: "DELETE", params: { id: "1" } }));

    expect(response.status).toBe(204);
    expect(db.tables.preferences.map((row) => row.id)).toEqual([2, 3]);
  });
});
