/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 */

import type { APIContext } from "astro";
import { GET, POST } from "@/pages/api/recipes/index";
import { DELETE, GET as getRecipe, PUT } from "@/pages/api/recipes/[id]";
import { createSupabaseTables, type TableState } from "../helpers/supabase-tables";

type RouteContext = Parameters<typeof GET>[0];

const getUser = jest.fn();

/** Zapamiętane wywołania łańcucha zapytania - po nazwie metody, w kolejności. */
let calls: Record<string, unknown[][]>;

/**
 * Łańcuchowy budowniczy w kształcie zapytania PostgREST: każda metoda zapisuje argumenty i zwraca
 * siebie, a `await` rozwiązuje go do pustej listy.
 */
const createBuilder = () => {
  const builder: Record<string, unknown> = {};

  for (const method of ["select", "eq", "ilike", "or", "order", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return builder;
    };
  }

  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null, count: 0 });

  return builder;
};

const from = jest.fn(() => createBuilder());

const requestContext = (params: Record<string, string> = {}) =>
  ({
    url: new URL(`http://localhost/api/recipes?${new URLSearchParams(params).toString()}`),
    locals: { supabase: { auth: { getUser }, from } },
  }) as unknown as RouteContext;

beforeEach(() => {
  jest.clearAllMocks();
  calls = {};

  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
});

describe("GET /api/recipes", () => {
  it("401 bez sesji", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(requestContext({ search: "owsianka" }));

    expect(response.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });

  it("gałąź ogólna przekazuje do or() ucieknięty i cytowany warunek", async () => {
    const response = await GET(requestContext({ search: "a,b(c)%" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [], total: 0 });
    expect(calls.or).toEqual([
      [String.raw`title.ilike."%a,b(c)\\%%",content.ilike."%a,b(c)\\%%",additional_params.ilike."%a,b(c)\\%%"`],
    ]);
    expect(calls.ilike).toBeUndefined();
    expect(calls.eq).toEqual([["user_id", "user-1"]]);
  });

  it("search_field=title przekazuje do ilike() wzorzec bez cytowania or()", async () => {
    const response = await GET(requestContext({ search: "50%", search_field: "title" }));

    expect(response.status).toBe(200);
    expect(calls.ilike).toEqual([["title", String.raw`%50\%%`]]);
    expect(calls.or).toBeUndefined();
  });

  it.each(["", "   "])("pusty albo biały termin %j nie dodaje filtra", async (search) => {
    const response = await GET(requestContext({ search }));

    expect(response.status).toBe(200);
    expect(calls.ilike).toBeUndefined();
    expect(calls.or).toBeUndefined();
  });

  it.each([
    ["dłuższy niż 200 znaków", "a".repeat(201)],
    ["ze znakiem NUL", "owsi\u0000anka"],
  ])("termin %s kończy się 400, zanim trafi do bazy", async (_label, search) => {
    const response = await GET(requestContext({ search }));

    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it("termin z dokładnie 200 znaków przechodzi", async () => {
    const response = await GET(requestContext({ search: "a".repeat(200) }));

    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/recipes/:id", () => {
  type Row = Record<string, unknown>;
  type DeleteContext = Parameters<typeof DELETE>[0];

  const USER_A = "user-a";
  const USER_B = "user-b";

  /** Stan tabeli `recipes` w atrapie - po operacji sprawdzany osobno od statusu odpowiedzi. */
  let recipes: Row[];

  /**
   * Stanowa atrapa z wierszami dwóch właścicieli. Budowniczy z `GET` wyżej tylko zapisuje
   * wywołania; tu `delete()` usuwa wyłącznie wiersze spełniające KAŻDY filtr `eq`, a łańcuch
   * rozwiązuje się przy `await` - tak jak `.delete().eq("id", …).eq("user_id", …)` w trasie.
   * Bez `select()` PostgREST nie oddaje usuniętych wierszy, więc atrapa zwraca `data: null`;
   * z `select()` oddaje usunięte wiersze - tak jak trasa po naprawie z `known-drift.md`. Dzięki temu
   * wyrocznie `test.failing` niżej przełączą się na czerwone właśnie wtedy, a nie na 500.
   */
  const createSupabase = (userId: string) => ({
    auth: { getUser: async () => ({ data: { user: { id: userId, email: `${userId}@example.com` } } }) },
    from: (table: string) => {
      if (table !== "recipes") {
        throw new Error(`Atrapa nie zna tabeli ${table}`);
      }

      const filters: [string, unknown][] = [];
      let deleting = false;
      let returning = false;
      const query = {
        delete: () => {
          deleting = true;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return query;
        },
        select: () => {
          returning = true;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);
          const deleted = deleting ? recipes.filter(matches) : [];
          if (deleting) {
            recipes = recipes.filter((row) => !matches(row));
          }
          return resolve({ data: returning ? deleted : null, error: null });
        },
      };
      return query;
    },
  });

  const deleteContext = (id: string, userId: string) =>
    ({
      params: { id },
      locals: { supabase: createSupabase(userId) },
    }) as unknown as DeleteContext;

  const ids = () => recipes.map((row) => row.id);

  beforeEach(() => {
    recipes = [
      { id: 10, user_id: USER_A, title: "Przepis A" },
      { id: 20, user_id: USER_B, title: "Przepis B" },
    ];
  });

  it("DELETE B na przepisie A zostawia wiersz A nietknięty", async () => {
    await DELETE(deleteContext("10", USER_B));

    expect(ids()).toEqual([10, 20]);
  });

  it("kontrola pozytywna: A usuwa własny przepis - 200 i wiersz znika", async () => {
    // Na tym kontrakcie stoi też `CleanupService.deleteAllTestUserRecipes` w E2E.
    const response = await DELETE(deleteContext("10", USER_A));

    expect(response.status).toBe(200);
    expect(ids()).toEqual([20]);
  });

  /**
   * Znany dług, opisany w `docs/reference/known-drift.md` („Własność rekordów”). Usunięcie cudzego
   * albo nieistniejącego przepisu nie może zgłaszać sukcesu, a dziś trasa oddaje 200
   * `{success:true}`, bo DELETE bez `.select("id")` nie mówi, czy cokolwiek trafił. Dlatego te testy
   * są `test.failing` - oczekiwana porażka zapisuje wyrocznię, nie obecne zachowanie. Po naprawie
   * zrobią się czerwone: zamień `test.failing` na `it` i usuń wpis z `known-drift.md`.
   */
  test.failing("DELETE B na przepisie A daje 404", async () => {
    const response = await DELETE(deleteContext("10", USER_B));

    expect(response.status).toBe(404);
  });

  test.failing("DELETE nieistniejącego przepisu daje 404", async () => {
    const response = await DELETE(deleteContext("999", USER_B));

    expect(response.status).toBe(404);
  });
});

/**
 * Ryzyko #6 test-planu dla zapisu przepisów: każdy sufit kolumny przepuszcza wartość na granicy
 * i odrzuca o krok dalej z 400 (nie z 500 od bazy), a przy 400 nic nie zostaje zapisane. Trasy są
 * prawdziwe; podmieniona jest tylko warstwa bazy (`tests/helpers/supabase-tables.ts`), która
 * celowo nie zna CHECK-ów - test dowodzi, że trasa odrzuca, zanim zapytanie dotrze do bazy.
 *
 * Wyrocznie to literały migracji `supabase/migrations/20250427130913_healthymeal_schema.sql`, nie
 * schemat pod testem:
 * - `title varchar(255) not null` - granica 255, krok dalej 256;
 * - `content text not null check (char_length(content) <= 5000)` - 5000 / 5001;
 * - `additional_params text check (char_length(additional_params) <= 5000)` - 5000 / 5001;
 * - `id serial` - int4, sufit 2147483647.
 */
describe("zapis przepisów - sufity bazy na serwerze", () => {
  const OWNER = "user-a";
  /** Sufit kolumny `title varchar(255)` - literał migracji. */
  const TITLE_MAX = 255;
  /** Sufit `char_length(content) <= 5000` i `char_length(additional_params) <= 5000` - literał migracji. */
  const TEXT_MAX = 5000;
  /** Największa wartość `serial` (int4) - literał typu kolumny `id`. */
  const INT4_MAX = 2147483647;
  const SECRET = "value too long for type character varying(255) on relation recipes";

  const seed = (): TableState => ({
    recipes: [
      {
        id: 10,
        user_id: OWNER,
        title: "Owsianka",
        content: "Płatki, mleko, banan.",
        additional_params: null,
        is_ai_generated: false,
        created_at: "2026-09-01T08:00:00.000Z",
        updated_at: "2026-09-01T08:00:00.000Z",
      },
    ],
  });

  const createDb = () => createSupabaseTables({ userId: OWNER, tables: seed() });
  type Supabase = ReturnType<typeof createDb>["supabase"];

  interface ContextInit {
    method: string;
    body?: unknown;
    /** Surowe ciało - do przypadku „nie-JSON”. */
    rawBody?: string;
    id?: string;
  }

  const context = (supabase: Supabase, init: ContextInit) => {
    const url = `http://localhost/api/recipes${init.id === undefined ? "" : `/${init.id}`}`;
    const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));

    return {
      request: new Request(url, { method: init.method, headers: { "Content-Type": "application/json" }, body }),
      params: init.id === undefined ? {} : { id: init.id },
      url: new URL(url),
      locals: { supabase },
    } as unknown as APIContext;
  };

  const validBody = { title: "Jajecznica", content: "Jajka, masło.", additional_params: "śniadanie" };

  /** Granice z tabeli wyroczni: [pole, wartość na granicy, wartość o krok dalej]. */
  const limits: [keyof typeof validBody, string, string][] = [
    ["title", "a".repeat(TITLE_MAX), "a".repeat(TITLE_MAX + 1)],
    ["content", "a".repeat(TEXT_MAX), "a".repeat(TEXT_MAX + 1)],
    ["additional_params", "a".repeat(TEXT_MAX), "a".repeat(TEXT_MAX + 1)],
  ];

  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // Trasy logują pełny błąd przy 500 - w testach wyciszone, ale sprawdzane tam, gdzie to kontrakt.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe("POST /api/recipes", () => {
    it.each(limits)("%s na granicy kolumny → 201 i zapis co do znaku", async (field, atLimit) => {
      const db = createDb();
      const body = { ...validBody, [field]: atLimit };

      const response = await POST(context(db.supabase, { method: "POST", body }));

      expect(response.status).toBe(201);
      expect(db.tables.recipes).toContainEqual(
        expect.objectContaining({ ...body, user_id: OWNER, is_ai_generated: false })
      );
    });

    it.each(limits)("%s o krok za granicą → 400 z details na polu, bez zapisu", async (field, _atLimit, over) => {
      const db = createDb();
      const before = db.snapshot();

      const response = await POST(context(db.supabase, { method: "POST", body: { ...validBody, [field]: over } }));

      expect(response.status).toBe(400);
      expect((await response.json()).details).toEqual([{ path: field, message: expect.any(String) }]);
      expect(db.snapshot()).toEqual(before);
    });

    it("ciało nie-JSON → 400, bez zapisu", async () => {
      const db = createDb();
      const before = db.snapshot();

      const response = await POST(context(db.supabase, { method: "POST", rawBody: "{tytuł" }));

      expect(response.status).toBe(400);
      expect(db.snapshot()).toEqual(before);
    });

    it("awaria bazy przy insercie → 500 ze stałym ciałem, bez treści błędu atrapy", async () => {
      const db = createDb();
      const failure = { data: null, error: { code: "22001", message: SECRET, details: SECRET, hint: SECRET } };
      const failingSupabase = {
        auth: db.supabase.auth,
        from: (table: string) =>
          Object.assign(db.supabase.from(table), {
            insert: () => ({ select: () => ({ single: async () => failure }) }),
          }),
      } as unknown as Supabase;

      const response = await POST(context(failingSupabase, { method: "POST", body: validBody }));

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Błąd wewnętrzny serwera" });
      expect(text).not.toContain("character varying");
      // Pełny błąd ląduje w logu serwera.
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure.error);
    });
  });

  describe("PUT /api/recipes/:id", () => {
    it.each(limits)("%s na granicy kolumny → 200 i zapis co do znaku", async (field, atLimit) => {
      const db = createDb();
      const body = { ...validBody, [field]: atLimit };

      const response = await PUT(context(db.supabase, { method: "PUT", id: "10", body }));

      expect(response.status).toBe(200);
      expect(db.tables.recipes).toEqual([expect.objectContaining({ ...body, id: 10, user_id: OWNER })]);
    });

    it.each(limits)("%s o krok za granicą → 400 z details na polu, bez zapisu", async (field, _atLimit, over) => {
      const db = createDb();
      const before = db.snapshot();

      const response = await PUT(
        context(db.supabase, { method: "PUT", id: "10", body: { ...validBody, [field]: over } })
      );

      expect(response.status).toBe(400);
      expect((await response.json()).details).toEqual([{ path: field, message: expect.any(String) }]);
      expect(db.snapshot()).toEqual(before);
    });

    it("ciało nie-JSON → 400, bez zapisu", async () => {
      const db = createDb();
      const before = db.snapshot();

      const response = await PUT(context(db.supabase, { method: "PUT", id: "10", rawBody: "{tytuł" }));

      expect(response.status).toBe(400);
      expect(db.snapshot()).toEqual(before);
    });

    it("awaria bazy przy aktualizacji → 500 ze stałym ciałem, bez treści błędu atrapy", async () => {
      const db = createDb();
      const failure = { data: null, error: { code: "22001", message: SECRET, details: SECRET, hint: SECRET } };
      const chain = { eq: () => chain, select: () => chain, single: async () => failure };
      const failingSupabase = {
        auth: db.supabase.auth,
        from: (table: string) => Object.assign(db.supabase.from(table), { update: () => chain }),
      } as unknown as Supabase;

      const response = await PUT(context(failingSupabase, { method: "PUT", id: "10", body: validBody }));

      expect(response.status).toBe(500);
      const text = await response.text();
      expect(JSON.parse(text)).toEqual({ error: "Błąd wewnętrzny serwera" });
      expect(text).not.toContain("character varying");
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), failure.error);
    });
  });

  describe("identyfikator przepisu ponad int4", () => {
    const over = String(INT4_MAX + 1);

    it.each([
      ["GET", getRecipe],
      ["PUT", PUT],
      ["DELETE", DELETE],
    ] as const)(`%s z id ${over} → 400, zanim zapytanie trafi do bazy`, async (method, route) => {
      const db = createDb();
      const before = db.snapshot();
      const from = jest.spyOn(db.supabase, "from");

      const body = method === "PUT" ? validBody : undefined;
      const response = await route(context(db.supabase, { method, id: over, body }));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "Nieprawidłowe ID przepisu" });
      expect(from).not.toHaveBeenCalled();
      expect(db.snapshot()).toEqual(before);
    });

    it(`GET z id ${INT4_MAX} (sufit int4) przechodzi schemat i kończy się 404`, async () => {
      const db = createDb();

      const response = await getRecipe(context(db.supabase, { method: "GET", id: String(INT4_MAX) }));

      expect(response.status).toBe(404);
    });
  });
});
