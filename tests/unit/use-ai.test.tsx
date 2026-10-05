import { act, renderHook } from "@testing-library/react";
import { useAI } from "@/hooks/ai/useAI";

/**
 * `fetch` zamockowany na krawędzi przeglądarki - hook nie wie nic o trasie poza statusem i ciałem
 * odpowiedzi. Atrapa odpowiedzi to zwykły obiekt, bo jsdom nie dostarcza klasy `Response`.
 */
const fetchMock = jest.fn();

const errorResponse = (status: number, body: unknown) => ({
  ok: false,
  status,
  json: async () => body,
});

const PARAMS = { additional_params: "wegańskie", base_recipe: null };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useAI - polityka ponowień", () => {
  it("502 AI_UNAVAILABLE nie jest ponawiane automatycznie - ponowienie należy do użytkownika", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(502, { error: "Usługa AI jest chwilowo niedostępna", code: "AI_UNAVAILABLE" })
    );

    const { result } = renderHook(() => useAI());

    await act(async () => {
      await expect(result.current.generateRecipe(PARAMS)).rejects.toThrow();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
    expect(result.current.retryable).toBe(true);
    expect(result.current.isGenerating).toBe(false);
  });

  it("502 AI_PARSE_ERROR nie jest ponawiane automatycznie i zostawia przycisk ponowienia", async () => {
    fetchMock.mockResolvedValue(
      errorResponse(502, { error: "AI zwróciło odpowiedź, której nie da się odczytać", code: "AI_PARSE_ERROR" })
    );

    const { result } = renderHook(() => useAI());

    await act(async () => {
      await expect(result.current.modifyRecipe(7, { additional_params: "mniej soli" })).rejects.toThrow();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
    expect(result.current.retryable).toBe(true);
  });

  it("502 z ciałem nie-JSON (strona bramy) też nie jest ponawiane", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    });

    const { result } = renderHook(() => useAI());

    await act(async () => {
      const pending = result.current.generateRecipe(PARAMS).catch(() => undefined);
      // Zapas na oba okna backoffu - gdyby ponowienie wróciło, zdążyłoby wystartować.
      await jest.advanceTimersByTimeAsync(10_000);
      await pending;
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).not.toBeNull();
    expect(result.current.retryable).toBe(true);
  });

  it("500 jest ponawiane jak dotąd: jedna próba i dwa ponowienia z backoffem", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(errorResponse(500, { error: "Błąd wewnętrzny serwera", code: "SERVER_ERROR" }));

    const { result } = renderHook(() => useAI());

    await act(async () => {
      const pending = result.current.generateRecipe(PARAMS).catch(() => undefined);
      // Backoff 1 s + 4 s - z zapasem, żeby oba ponowienia zdążyły wystartować.
      await jest.advanceTimersByTimeAsync(10_000);
      await pending;
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.error).not.toBeNull();
    expect(result.current.retryable).toBe(true);
  });
});
