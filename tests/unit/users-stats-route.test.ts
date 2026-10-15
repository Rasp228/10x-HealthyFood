/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 */

import { GET } from "@/pages/api/users/stats";

type RouteContext = Parameters<typeof GET>[0];

const REQUEST_ID = "req-1";

/** Atrapa `from("recipes").select().eq()`, która rozwiązuje się podanym wynikiem. */
const supabaseResolving = (result: { data: unknown; error: unknown }) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };

  return {
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "test@example.com" } } }) },
    from: () => chain,
  };
};

const requestContext = (supabase: ReturnType<typeof supabaseResolving>) =>
  ({ locals: { supabase, requestId: REQUEST_ID } }) as unknown as RouteContext;

let consoleError: jest.SpyInstance;

beforeEach(() => {
  // W `beforeEach`, bo `jest.setup.ts` podmienia metody `console` w `beforeAll`.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("GET /api/users/stats", () => {
  it("200 ze statystykami", async () => {
    const supabase = supabaseResolving({
      data: [
        { id: 1, is_ai_generated: true, created_at: "2026-10-01T08:00:00.000Z" },
        { id: 2, is_ai_generated: false, created_at: "2026-10-03T08:00:00.000Z" },
      ],
      error: null,
    });

    const response = await GET(requestContext(supabase));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalRecipes: 2,
      aiGeneratedRecipes: 1,
      lastRecipeDate: "2026-10-03T08:00:00.000Z",
    });
  });

  it("awaria bazy → 500 z requestId, bez details, z linią users.stats_failed", async () => {
    const SECRET = "permission denied for table recipes";
    const supabase = supabaseResolving({
      data: null,
      error: { code: "42501", message: SECRET, details: SECRET, hint: null },
    });

    const response = await GET(requestContext(supabase));

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ error: "Błąd wewnętrzny serwera", requestId: REQUEST_ID });
    expect(text).not.toContain("permission denied");

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleError.mock.calls[0][0] as string)).toMatchObject({
      event: "users.stats_failed",
      requestId: REQUEST_ID,
      userId: "user-1",
      error: { name: "DatabaseError", code: "42501" },
    });
  });
});
