import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { logError, logWarn } from "./log";
import type { LogContext } from "./log";

/**
 * Błędy GoTrue z tras auth.
 *
 * Supabase oddaje błąd logowania, rejestracji i zmiany hasła w `{ error }`, a trasy traktowały
 * każdy jako winę użytkownika: awaria GoTrue albo sieci kończyła się „Nieprawidłowy email lub
 * hasło” i nie zostawiała śladu w logu. Klasyfikacja oddziela trzy przypadki:
 *
 * - `client` - odrzucenie żądania przez GoTrue (4xx poza 429): złe hasło, zajęty e-mail, słabe
 *   hasło, brak sesji. Trasa odpowiada jak dotąd.
 * - `rate_limited` - 429: limit prób albo wysyłki e-maili. Nie awaria, ale warto ją widzieć.
 * - `unavailable` - reszta: `AuthRetryableFetchError` (sieć, timeout), 5xx, błąd bez statusu.
 *
 * Bez `import.meta`: moduł importują trasy testowane w ts-jest.
 */
export type AuthErrorKind = "client" | "rate_limited" | "unavailable";

const RATE_LIMITED_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
const UNAVAILABLE_MESSAGE = "Usługa logowania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.";

function statusOf(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Za błąd klienta uchodzi każdy `AuthError` z 4xx, nie tylko `AuthApiError`: słabe hasło
 * (`AuthWeakPasswordError`, 422) i brak sesji (`AuthSessionMissingError`, 400) to klasy pochodne
 * `CustomAuthError`, a też są odpowiedzią na dane od użytkownika. `AuthRetryableFetchError` jest
 * wyłączony jawnie - to zawsze sieć albo przeciążenie, niezależnie od statusu.
 */
export function classifyAuthError(error: unknown): AuthErrorKind {
  const status = statusOf(error);

  if (status === 429) {
    return "rate_limited";
  }

  if (
    isAuthError(error) &&
    !isAuthRetryableFetchError(error) &&
    status !== undefined &&
    status >= 400 &&
    status < 500
  ) {
    return "client";
  }

  return "unavailable";
}

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Odpowiedź trasy auth na błąd z GoTrue, który NIE jest błędem klienta.
 *
 * `null` dla `client` - trasa odpowiada wtedy własnym komunikatem, jak przed tą zmianą. Dla
 * `rate_limited` - 429 i ostrzeżenie, dla `unavailable` - 503 z `requestId` i linia błędu.
 * W kontekście nie ma e-maila: `log.ts` i tak go odrzuca, a do korelacji wystarcza `requestId`.
 *
 * @param error - Błąd z `{ error }` wywołania `supabase.auth.*`
 * @param context - Kontekst logu trasy (`requestId`, `route`, `step`)
 */
export function authServiceFailure(error: unknown, context: LogContext): Response | null {
  const kind = classifyAuthError(error);

  if (kind === "client") {
    return null;
  }

  if (kind === "rate_limited") {
    logWarn("auth.rate_limited", context, error);
    return jsonResponse({ error: RATE_LIMITED_MESSAGE }, 429);
  }

  logError("auth.unavailable", context, error);
  return jsonResponse({ error: UNAVAILABLE_MESSAGE, requestId: context.requestId }, 503);
}
