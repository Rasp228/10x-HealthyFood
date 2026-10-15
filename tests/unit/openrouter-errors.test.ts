import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { isRetryable, mapAxiosError } from "@/lib/api/openrouter.errors";
import {
  AuthenticationError,
  BudgetExceededError,
  ModelUnavailableError,
  NetworkError,
  OpenRouterError,
  RateLimitError,
} from "@/lib/api/openrouter.types";

/**
 * Moduł mapowania nie czyta `import.meta`, więc - inaczej niż `openrouter.service.ts` - ładuje się
 * pod ts-jest bez mocka. Błędy budujemy prawdziwym `AxiosError`, tak jak rzuca je `httpClient.post`.
 */
const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;

function httpError(status: number, message?: string): AxiosError {
  const response = {
    status,
    statusText: "",
    headers: {},
    config,
    data: message ? { error: { message } } : {},
  } as AxiosResponse;

  return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, null, response);
}

describe("mapAxiosError", () => {
  it.each([401, 403])("%i → AuthenticationError ze statusem, modelem i oryginałem w `cause`", (status) => {
    const original = httpError(status, "Invalid API key");

    const mapped = mapAxiosError(original, MODEL);

    expect(mapped).toBeInstanceOf(AuthenticationError);
    expect(mapped.message).toBe("Invalid API key");
    expect(mapped.status).toBe(status);
    expect(mapped.model).toBe(MODEL);
    expect(mapped.cause).toBe(original);
  });

  it("429 → RateLimitError ze statusem", () => {
    const mapped = mapAxiosError(httpError(429), MODEL);

    expect(mapped).toBeInstanceOf(RateLimitError);
    expect(mapped.status).toBe(429);
  });

  it("404 → ModelUnavailableError z nazwą modelu", () => {
    const mapped = mapAxiosError(httpError(404), MODEL);

    expect(mapped).toBeInstanceOf(ModelUnavailableError);
    expect(mapped.message).toContain(MODEL);
    expect(mapped.model).toBe(MODEL);
    expect(mapped.status).toBe(404);
  });

  it("402 → BudgetExceededError", () => {
    const mapped = mapAxiosError(httpError(402), MODEL);

    expect(mapped).toBeInstanceOf(BudgetExceededError);
    expect(mapped.status).toBe(402);
  });

  it('timeout bez odpowiedzi → NetworkError z `cause.code === "ECONNABORTED"`', () => {
    const original = new AxiosError("timeout of 60000ms exceeded", "ECONNABORTED", config);

    const mapped = mapAxiosError(original, MODEL);

    expect(mapped).toBeInstanceOf(NetworkError);
    expect(mapped.status).toBeUndefined();
    expect(mapped.model).toBe(MODEL);
    expect((mapped.cause as AxiosError).code).toBe("ECONNABORTED");
  });

  it("zwraca już zmapowany OpenRouterError bez zmian (idempotencja)", () => {
    const once = mapAxiosError(httpError(429), MODEL);

    expect(mapAxiosError(once, "inny-model")).toBe(once);
  });
});

describe("isRetryable", () => {
  it.each([400, 401, 402, 403, 404, 429])("%i nie jest ponawiany", (status) => {
    expect(isRetryable(mapAxiosError(httpError(status), MODEL))).toBe(false);
  });

  it.each([500, 502, 503])("%i jest ponawiany", (status) => {
    expect(isRetryable(mapAxiosError(httpError(status), MODEL))).toBe(true);
  });

  it("błąd sieci jest ponawiany", () => {
    const original = new AxiosError("getaddrinfo ENOTFOUND openrouter.ai", "ENOTFOUND", config);

    expect(isRetryable(mapAxiosError(original, MODEL))).toBe(true);
  });

  it("OpenRouterError bez statusu (np. brak konfiguracji) nie jest ponawiany", () => {
    expect(isRetryable(new OpenRouterError("Konfiguracja OpenRouter jest niekompletna"))).toBe(false);
  });
});
