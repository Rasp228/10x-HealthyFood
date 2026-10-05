/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 */

import { AIResponseParseError, AIService } from "@/lib/services/ai.service";
import { OpenRouterError } from "@/lib/api/openrouter.types";
import { POST } from "@/pages/api/ai/modify-recipe";
import type { ModifiedRecipeDto } from "@/types";

/**
 * Ten sam układ co `ai-generate-recipe-route.test.ts`: zamockowany wyłącznie moduł dostawcy,
 * `AIService` prawdziwy z podmienioną metodą `modifyRecipe`.
 */
jest.mock("@/lib/api/openrouter.service", () => ({
  OpenRouterService: jest.fn().mockImplementation(() => ({ setResponseFormat: jest.fn() })),
}));

const modifyRecipe = jest.spyOn(AIService.prototype, "modifyRecipe");

const getUser = jest.fn();

/** Wynik odczytu przepisu `from("recipes").select().eq().eq().single()`, którym trasa sprawdza właściciela. */
const recipeSingle = jest.fn();

const STORED_RECIPE = { id: 7, title: "Owsianka", content: "Płatki i mleko", user_id: "user-1" };

const requestContext = (body: unknown = { recipe_id: 7, additional_params: "mniej soli" }) =>
  ({
    request: new Request("http://localhost/api/ai/modify-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: {
      supabase: {
        auth: { getUser },
        from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: recipeSingle }) }) }) }),
      },
    },
  }) as unknown as Parameters<typeof POST>[0];

const MODIFIED: ModifiedRecipeDto = {
  original_recipe: { id: 7, title: "Owsianka", content: "Płatki i mleko" },
  modified_recipe: { title: "Owsianka bez soli", content: "Płatki i mleko", additional_params: "mniej soli" },
  ai_model: "model-testowy",
  generate_response_time: 1200,
  logId: 42,
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  recipeSingle.mockResolvedValue({ data: STORED_RECIPE, error: null });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("POST /api/ai/modify-recipe", () => {
  it("zwraca 200 z wynikiem serwisu", async () => {
    modifyRecipe.mockResolvedValue(MODIFIED);

    const response = await POST(requestContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(MODIFIED);
    expect(modifyRecipe).toHaveBeenCalledWith("user-1", 7, {
      additional_params: "mniej soli",
      base_recipe: JSON.stringify(STORED_RECIPE),
    });
  });

  it("bez sesji zwraca 401 i nie woła serwisu", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestContext());

    expect(response.status).toBe(401);
    expect(modifyRecipe).not.toHaveBeenCalled();
  });

  it("cudzy albo nieistniejący przepis daje 404 i nie woła serwisu", async () => {
    recipeSingle.mockResolvedValue({ data: null, error: { message: "not found" } });

    const response = await POST(requestContext());

    expect(response.status).toBe(404);
    expect(modifyRecipe).not.toHaveBeenCalled();
  });

  it("OpenRouterError z serwisu daje 502 AI_UNAVAILABLE", async () => {
    modifyRecipe.mockRejectedValue(new OpenRouterError("Błąd sieci"));

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Usługa AI jest chwilowo niedostępna",
      code: "AI_UNAVAILABLE",
    });
  });

  it("AIResponseParseError z serwisu daje 502 AI_PARSE_ERROR", async () => {
    modifyRecipe.mockRejectedValue(new AIResponseParseError());

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "AI zwróciło odpowiedź, której nie da się odczytać",
      code: "AI_PARSE_ERROR",
    });
  });

  it("inny błąd daje 500 ze stałym ciałem, bez komunikatu błędu i bez `details`", async () => {
    modifyRecipe.mockRejectedValue(new Error('relation "logs" violates policy logs_insert_own'));

    const response = await POST(requestContext());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: "Błąd wewnętrzny serwera", code: "SERVER_ERROR" });
    expect(body).not.toContain("logs_insert_own");
  });
});
