/**
 * Mapowanie błędu żądania do OpenRoutera na hierarchię `OpenRouterError` i decyzja o ponowieniu.
 *
 * Wyjęte z `openrouter.service.ts`, który czyta `import.meta.env` i dlatego w ts-jest jest zawsze
 * mockowany. Ten moduł (i wszystko, co importuje) nie może sięgać po `import.meta` - inaczej
 * przewróci testy na samym `import`.
 */
import {
  OpenRouterError,
  AuthenticationError,
  RateLimitError,
  ModelUnavailableError,
  TokenLimitError,
  ContentFilterError,
  NetworkError,
  BudgetExceededError,
} from "./openrouter.types";

interface ProviderResponse {
  status: number;
  message?: string;
}

/** Czyta `response.status` i `response.data.error.message` z błędu axios bez zależności od jego typów. */
function readResponse(error: unknown): ProviderResponse | null {
  if (error === null || typeof error !== "object" || !("response" in error)) {
    return null;
  }

  const response = (error as { response?: unknown }).response;
  if (response === null || typeof response !== "object") {
    return null;
  }

  const { status, data } = response as { status?: unknown; data?: { error?: { message?: unknown } } };
  if (typeof status !== "number") {
    return null;
  }

  const message = data?.error?.message;
  return { status, message: typeof message === "string" && message !== "" ? message : undefined };
}

/**
 * Zamienia dowolny błąd żądania na `OpenRouterError` - raz. Błąd już zmapowany wraca bez zmian,
 * więc podwójne wywołanie nie gubi `status` ani `cause`. Oryginał zostaje w `cause`: przy braku
 * odpowiedzi to on niesie `code` axios (`ECONNABORTED` przy timeoucie, `ENOTFOUND` przy DNS).
 */
export function mapAxiosError(error: unknown, model: string): OpenRouterError {
  if (error instanceof OpenRouterError) {
    return error;
  }

  const response = readResponse(error);

  if (!response) {
    return new NetworkError(undefined, { cause: error, model });
  }

  const { status, message } = response;
  const options = { cause: error, status, model };

  switch (status) {
    case 401:
    case 403:
      return new AuthenticationError(message || "Błąd uwierzytelniania", options);
    case 429:
      return new RateLimitError(message || "Przekroczono limit zapytań", options);
    case 404:
      return new ModelUnavailableError(model, message, options);
    case 400:
      if (message?.includes("token")) {
        return new TokenLimitError(message, options);
      }
      if (message?.includes("content")) {
        return new ContentFilterError(message, options);
      }
      return new OpenRouterError(message || "Błąd żądania", options);
    case 402:
      return new BudgetExceededError(message, options);
    default:
      return new OpenRouterError(message || `Błąd HTTP ${status}`, options);
  }
}

/**
 * Ponawiamy tylko to, co może się samo naprawić: brak odpowiedzi (sieć, timeout) i 5xx.
 * 4xx (klucz, limit, brak modelu, budżet) przy drugiej próbie da ten sam wynik.
 */
export function isRetryable(error: OpenRouterError): boolean {
  if (error instanceof NetworkError) {
    return true;
  }

  return error.status !== undefined && error.status >= 500 && error.status < 600;
}
