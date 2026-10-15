/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 */

import { POST } from "@/pages/api/ai/save-recipe";

/**
 * Ten sam układ co `ai-modify-recipe-route.test.ts`, zawężony do kontraktu 500: komunikat błędu bazy
 * zostaje w logu serwera, a do przeglądarki idzie stałe ciało bez `details`.
 */
jest.mock("@/lib/api/openrouter.service", () => ({
  OpenRouterService: jest.fn().mockImplementation(() => ({ setResponseFormat: jest.fn() })),
}));

const getUser = jest.fn();

/** Wynik `insert().select().single()` przy nowym przepisie. */
const insertSingle = jest.fn();

/** Wynik `update().eq().eq().select().single()` przy zastępowaniu przepisu. */
const updateSingle = jest.fn();

/** Wynik `select().eq().eq().single()`, którym trasa sprawdza właściciela zastępowanego przepisu. */
const ownerSingle = jest.fn();

const DB_MESSAGE = 'new row violates row-level security policy for table "recipes"';

const RECIPE = { title: "Owsianka", content: "Płatki i mleko", additional_params: null };

const requestContext = (body: unknown) =>
  ({
    request: new Request("http://localhost/api/ai/save-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: {
      requestId: "req-1",
      supabase: {
        auth: { getUser },
        from: () => ({
          insert: () => ({ select: () => ({ single: insertSingle }) }),
          update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: updateSingle }) }) }) }),
          select: () => ({ eq: () => ({ eq: () => ({ single: ownerSingle }) }) }),
        }),
      },
    },
  }) as unknown as Parameters<typeof POST>[0];

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  ownerSingle.mockResolvedValue({ data: { id: 7 }, error: null });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("POST /api/ai/save-recipe - 500 bez wycieku szczegółów", () => {
  it("błąd zapisu nowego przepisu daje stałe ciało bez komunikatu bazy", async () => {
    insertSingle.mockResolvedValue({ data: null, error: { message: DB_MESSAGE } });

    const response = await POST(requestContext({ recipe: RECIPE, is_new: true }));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Nie udało się utworzyć przepisu", code: "SERVER_ERROR" });
    expect(body).not.toContain(DB_MESSAGE);
  });

  it("błąd zastąpienia przepisu daje stałe ciało bez komunikatu bazy", async () => {
    updateSingle.mockResolvedValue({ data: null, error: { message: DB_MESSAGE } });

    const response = await POST(
      requestContext({ recipe: RECIPE, is_new: false, replace_existing: { recipe_id: 7, replace: true } })
    );

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Nie udało się zaktualizować przepisu", code: "SERVER_ERROR" });
    expect(body).not.toContain(DB_MESSAGE);
  });

  it("nieoczekiwany wyjątek daje stałe ciało, a pełny błąd trafia do logu", async () => {
    insertSingle.mockRejectedValue(new Error(DB_MESSAGE));

    const response = await POST(requestContext({ recipe: RECIPE, is_new: true }));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Błąd wewnętrzny serwera", code: "SERVER_ERROR", requestId: "req-1" });
    expect(body).not.toContain(DB_MESSAGE);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toMatchObject({
      event: "ai.save_recipe_failed",
      requestId: "req-1",
      userId: "user-1",
    });
  });
});

describe("POST /api/ai/save-recipe - odczyt zastępowanego przepisu", () => {
  const replaceBody = { recipe: RECIPE, is_new: false, replace_existing: { recipe_id: 7, replace: true } };

  it("brak wiersza (PGRST116) daje 404 i nic nie zapisuje", async () => {
    ownerSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
    });

    const response = await POST(requestContext(replaceBody));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "RECIPE_NOT_FOUND" });
    expect(updateSingle).not.toHaveBeenCalled();
  });

  it("inny kod błędu daje 500 z requestId i linią logu z code, nie 404", async () => {
    ownerSingle.mockResolvedValue({
      data: null,
      error: { code: "42501", message: DB_MESSAGE, details: null, hint: null },
    });

    const response = await POST(requestContext(replaceBody));

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "Błąd wewnętrzny serwera", code: "SERVER_ERROR", requestId: "req-1" });
    expect(body).not.toContain(DB_MESSAGE);
    expect(updateSingle).not.toHaveBeenCalled();

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(JSON.parse(consoleError.mock.calls[0][0])).toMatchObject({
      event: "ai.save_recipe_failed",
      requestId: "req-1",
      userId: "user-1",
      recipeId: 7,
      error: { name: "DatabaseError", code: "42501" },
    });
  });
});
