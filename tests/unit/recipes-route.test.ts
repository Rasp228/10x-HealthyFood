/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 */

import { GET } from "@/pages/api/recipes/index";

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
});
