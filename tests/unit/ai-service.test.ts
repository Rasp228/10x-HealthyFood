/**
 * @jest-environment node
 *
 * Kod serwerowy: serwis biegnie w produkcji w funkcji Vercela, więc node jest środowiskiem
 * wierniejszym niż domyślny jsdom.
 */

import { AIResponseParseError, AIService } from "@/lib/services/ai.service";
import { OpenRouterService } from "@/lib/api/openrouter.service";
import { OpenRouterError, RateLimitError } from "@/lib/api/openrouter.types";
import type { ChatResponse } from "@/lib/api/openrouter.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

/**
 * Mockowany jest WYŁĄCZNIE moduł dostawcy - `AIService` zostaje prawdziwy. Wzorzec i oba powody
 * (deterministyczna suita bez płatnych wywołań oraz `import.meta.env` w `openrouter.service.ts`,
 * którego ts-jest nie skompiluje do CommonJS) opisuje `calorie-estimation.service.test.ts`.
 */
jest.mock("@/lib/api/openrouter.service", () => ({
  OpenRouterService: jest.fn(),
}));

const OpenRouterServiceMock = OpenRouterService as unknown as jest.Mock;

const sendMessage = jest.fn();
const setResponseFormat = jest.fn();
const setModel = jest.fn();

/** Koperta odpowiedzi OpenAI z podaną treścią wiadomości modelu. */
const chatResponse = (content: unknown): ChatResponse =>
  ({
    id: "resp-1",
    model: "model-testowy",
    created: 1_700_000_000,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }) as ChatResponse;

/** Konfiguracja, z jaką serwis zbudował swojego klienta. */
const clientConfig = (): Record<string, unknown> => OpenRouterServiceMock.mock.calls[0][0] as Record<string, unknown>;

/** Wiersze wstawione do tabeli `logs` - log akcji AI. */
const logInsert = jest.fn();

/**
 * Atrapa Supabase w kształcie, którego serwis faktycznie dotyka: odczyt preferencji, odczyt
 * `additional_params` przepisu (modyfikacja) i wstawienie logu akcji z odczytem jego `id`.
 */
const createSupabaseStub = () =>
  ({
    from: (table: string) => {
      if (table === "preferences") {
        return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
      }

      if (table === "recipes") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
        };
      }

      if (table === "logs") {
        return {
          insert: (row: unknown) => {
            logInsert(row);
            return { select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }) };
          },
        };
      }

      throw new Error(`Nieoczekiwana tabela w teście: ${table}`);
    },
  }) as unknown as SupabaseClient<Database>;

const generate = () =>
  new AIService(createSupabaseStub()).generateRecipe("user-1", { additional_params: null, base_recipe: null });

const modify = () =>
  new AIService(createSupabaseStub()).modifyRecipe("user-1", 7, {
    additional_params: "mniej soli",
    base_recipe: JSON.stringify({ id: 7, title: "Owsianka", content: "Płatki i mleko" }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  OpenRouterServiceMock.mockImplementation(() => ({ sendMessage, setResponseFormat, setModel }));
});

describe("AIService", () => {
  describe("konfiguracja klienta", () => {
    it("daje wywołaniu dokładnie jedną próbę - `retries: 1` znaczy w tym kliencie 'bez powtórzeń'", () => {
      new AIService(createSupabaseStub());

      expect(clientConfig().retries).toBe(1);
    });

    it("zostawia wywołaniu budżet 55 s, ściśle pod `maxDuration: 60` platformy", () => {
      new AIService(createSupabaseStub());

      expect(clientConfig().timeout).toBe(55_000);
    });

    it("nie podaje klucza sam - klient czyta go ze środowiska", () => {
      new AIService(createSupabaseStub());

      expect(clientConfig().apiKey).toBe("");
    });

    it("zamienia brak klucza na OpenRouterError, żeby trasa zbudowała z tego 502, a nie 500", () => {
      OpenRouterServiceMock.mockImplementation(() => {
        throw new Error("Klucz API jest wymagany - podaj go w konfiguracji lub ustaw zmienną OPENROUTER_API_KEY");
      });

      expect(() => new AIService(createSupabaseStub())).toThrow(OpenRouterError);
    });

    it("przepuszcza OpenRouterError z konstruktora klienta bez owijania go drugi raz", () => {
      const original = new RateLimitError();
      OpenRouterServiceMock.mockImplementation(() => {
        throw original;
      });

      expect(() => new AIService(createSupabaseStub())).toThrow(original);
    });
  });

  describe("generateRecipe", () => {
    it("zwraca przepis z treści modelu i zapisuje log akcji", async () => {
      sendMessage.mockResolvedValue(
        chatResponse(
          '{"title": "Owsianka z bananem", "content": "Płatki, mleko, banan", "additional_params": "szybkie"}'
        )
      );

      const result = await generate();

      expect(result.recipe).toEqual({
        title: "Owsianka z bananem",
        content: "Płatki, mleko, banan",
        additional_params: "szybkie",
      });
      expect(result.ai_model).toBe("model-testowy");
      expect(result.logId).toBe(42);
      expect(logInsert).toHaveBeenCalledTimes(1);
    });

    it("pusta treść modelu kończy się AIResponseParseError, nie przepisem 'Błąd generowania'", async () => {
      sendMessage.mockResolvedValue(chatResponse(""));

      await expect(generate()).rejects.toBeInstanceOf(AIResponseParseError);
    });

    it("treść z samych białych znaków kończy się AIResponseParseError", async () => {
      sendMessage.mockResolvedValue(chatResponse("  \n\t  "));

      await expect(generate()).rejects.toBeInstanceOf(AIResponseParseError);
    });

    it("treść, która nie jest napisem, kończy się AIResponseParseError", async () => {
      sendMessage.mockResolvedValue(chatResponse(42));

      await expect(generate()).rejects.toBeInstanceOf(AIResponseParseError);
    });

    it("nieudana odpowiedź nie zostawia logu akcji udającego sukces", async () => {
      sendMessage.mockResolvedValue(chatResponse(""));

      await expect(generate()).rejects.toThrow();

      expect(logInsert).not.toHaveBeenCalled();
    });

    it("OpenRouterError z wywołania modelu propaguje do trasy bez zmian", async () => {
      const original = new RateLimitError();
      sendMessage.mockRejectedValue(original);

      await expect(generate()).rejects.toBe(original);
      expect(logInsert).not.toHaveBeenCalled();
    });

    it("tekst nie-JSON staje się przepisem z parsowania tekstowego (obecne zachowanie)", async () => {
      sendMessage.mockResolvedValue(
        chatResponse("Owsianka z bananem\nSkładniki:\n- 100 g płatków\nPrzygotowanie:\n1. Zagotuj mleko")
      );

      const result = await generate();

      expect(result.recipe.title).toBe("Owsianka z bananem");
      expect(result.recipe.content).toBe("Składniki:\n- 100 g płatków\nPrzygotowanie:\n1. Zagotuj mleko");
    });
  });

  describe("modifyRecipe", () => {
    it("zwraca zmodyfikowany przepis z treści modelu obok oryginału", async () => {
      sendMessage.mockResolvedValue(chatResponse('{"title": "Owsianka bez soli", "content": "Płatki i mleko"}'));

      const result = await modify();

      expect(result.original_recipe).toEqual({ id: 7, title: "Owsianka", content: "Płatki i mleko" });
      expect(result.modified_recipe.title).toBe("Owsianka bez soli");
      expect(result.modified_recipe.content).toBe("Płatki i mleko");
      expect(result.logId).toBe(42);
    });

    it("pusta treść modelu kończy się AIResponseParseError i bez logu akcji", async () => {
      sendMessage.mockResolvedValue(chatResponse("   "));

      await expect(modify()).rejects.toBeInstanceOf(AIResponseParseError);
      expect(logInsert).not.toHaveBeenCalled();
    });

    it("OpenRouterError z wywołania modelu propaguje do trasy bez zmian", async () => {
      const original = new OpenRouterError("Błąd sieci");
      sendMessage.mockRejectedValue(original);

      await expect(modify()).rejects.toBe(original);
    });
  });
});
