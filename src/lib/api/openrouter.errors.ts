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
  ResponseParsingError,
} from "./openrouter.types";
import type { ChatResponse } from "./openrouter.types";

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

/** Czyta `message` i `code` z pola `error` koperty - dostawca wkłada tam opis awarii upstreamu. */
function describeProviderError(error: unknown): string {
  if (error === null || typeof error !== "object") {
    return String(error);
  }

  const { message, code } = error as { message?: unknown; code?: unknown };
  const parts: string[] = [];

  if (typeof message === "string" && message !== "") parts.push(message);
  if ((typeof code === "string" && code !== "") || typeof code === "number") parts.push(`kod ${code}`);

  return parts.length > 0 ? parts.join(", ") : "brak opisu";
}

/**
 * Sprawdza kopertę odpowiedzi 200 od OpenRoutera, zanim ktokolwiek zacznie w niej szukać treści.
 *
 * OpenRouter potrafi oddać 200 z polem `error` (awaria dostawcy upstream) albo bez `choices`. To
 * awaria dostawcy, nie bezużyteczna odpowiedź modelu - bez tej bramki trasa zapisałaby ją jako
 * „model nic nie policzył”. Rzut `ResponseParsingError` (podklasa `OpenRouterError`) daje
 * w trasach to samo 502, co każda inna awaria dostawcy.
 *
 * Wyjęte z `OpenRouterService.processResponse`, bo tamten moduł czyta `import.meta.env` i w ts-jest
 * nie da się go załadować.
 */
export function validateChatEnvelope(response: unknown, model: string): ChatResponse {
  if (response === null || typeof response !== "object" || Array.isArray(response)) {
    throw new ResponseParsingError("Odpowiedź OpenRouter nie jest obiektem", { model });
  }

  const envelope = response as { error?: unknown; choices?: unknown };

  if (envelope.error !== undefined && envelope.error !== null) {
    throw new ResponseParsingError(
      `OpenRouter zwrócił błąd w odpowiedzi 200: ${describeProviderError(envelope.error)}`,
      {
        model,
        cause: envelope.error,
      }
    );
  }

  if (!Array.isArray(envelope.choices) || envelope.choices.length === 0) {
    throw new ResponseParsingError("Odpowiedź OpenRouter nie zawiera żadnego wyboru (`choices`)", { model });
  }

  return response as ChatResponse;
}
