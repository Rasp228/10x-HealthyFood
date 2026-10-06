/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 */

import { GET } from "@/pages/api/recipes/index";
import { DELETE } from "@/pages/api/recipes/[id]";

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
