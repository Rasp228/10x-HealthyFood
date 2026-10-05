/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 */

import { AIResponseParseError, AIService } from "@/lib/services/ai.service";
import { OpenRouterError, RateLimitError } from "@/lib/api/openrouter.types";
import { POST } from "@/pages/api/ai/generate-recipe";
import type { GeneratedRecipeDto } from "@/types";

/**
 * Moduł dostawcy jest zamockowany, bo czyta `import.meta.env` - pod ts-jest sam jego import
 * wywróciłby plik. `AIService` zostaje prawdziwy, a podmieniana jest wyłącznie jego metoda:
 * dzięki temu `AIResponseParseError` łapany w trasie jest tą samą klasą, którą serwis rzuca
 * w produkcji (wzorzec z `diary-estimate-route.test.ts`).
 */
jest.mock("@/lib/api/openrouter.service", () => ({
  OpenRouterService: jest.fn().mockImplementation(() => ({ setResponseFormat: jest.fn() })),
}));

const generateRecipe = jest.spyOn(AIService.prototype, "generateRecipe");

const getUser = jest.fn();

const requestContext = (body: unknown = { additional_params: "wegańskie", base_recipe: null }) =>
  ({
    request: new Request("http://localhost/api/ai/generate-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: { supabase: { auth: { getUser } } },
  }) as unknown as Parameters<typeof POST>[0];

const GENERATED: GeneratedRecipeDto = {
  recipe: { title: "Owsianka z bananem", content: "Płatki, mleko, banan", additional_params: "wegańskie" },
  ai_model: "model-testowy",
  generate_response_time: 1200,
  logId: 42,
};

let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("POST /api/ai/generate-recipe", () => {
  it("zwraca 200 z wynikiem serwisu", async () => {
    generateRecipe.mockResolvedValue(GENERATED);

    const response = await POST(requestContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(GENERATED);
    expect(generateRecipe).toHaveBeenCalledWith("user-1", { additional_params: "wegańskie", base_recipe: null });
  });

  it("bez sesji zwraca 401 i nie woła serwisu", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(requestContext());

    expect(response.status).toBe(401);
    expect(generateRecipe).not.toHaveBeenCalled();
  });

  it("OpenRouterError z serwisu daje 502 AI_UNAVAILABLE", async () => {
    generateRecipe.mockRejectedValue(new RateLimitError());

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Usługa AI jest chwilowo niedostępna",
      code: "AI_UNAVAILABLE",
    });
  });

  it("AIResponseParseError z serwisu daje 502 AI_PARSE_ERROR", async () => {
    generateRecipe.mockRejectedValue(new AIResponseParseError());

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "AI zwróciło odpowiedź, której nie da się odczytać",
      code: "AI_PARSE_ERROR",
    });
  });

  it("brak klucza w konstruktorze klienta daje 502 AI_UNAVAILABLE, nie 500", async () => {
    // Konstrukcja serwisu stoi w tym samym `try`, co wywołanie modelu.
    const { OpenRouterService } = jest.requireMock("@/lib/api/openrouter.service") as {
      OpenRouterService: jest.Mock;
    };
    OpenRouterService.mockImplementationOnce(() => {
      throw new Error("Klucz API jest wymagany");
    });

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Usługa AI jest chwilowo niedostępna",
      code: "AI_UNAVAILABLE",
    });
  });

  it("inny błąd daje 500 ze stałym ciałem, bez komunikatu błędu i bez `details`", async () => {
    generateRecipe.mockRejectedValue(new Error('relation "logs" violates policy logs_insert_own'));

    const response = await POST(requestContext());
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: "Błąd wewnętrzny serwera", code: "SERVER_ERROR" });
    expect(body).not.toContain("logs_insert_own");
  });

  it("nie zamienia OpenRouterError w 500 - klasa bazowa też daje 502", async () => {
    generateRecipe.mockRejectedValue(new OpenRouterError("Błąd sieci"));

    const response = await POST(requestContext());

    expect(response.status).toBe(502);
  });
});
