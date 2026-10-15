/**
 * Błąd bazy z kodu aplikacji.
 *
 * Supabase oddaje błąd PostgREST jako zwykły obiekt (`{ message, code, details, hint }`), bez
 * stosu - rzucony wprost nie mówi, która metoda serwisu go dostała, a `new Error(error.message)`
 * gubi `code`, po którym w logu odróżnia się RLS od naruszenia ograniczenia. Opakowanie daje stos
 * z miejsca wywołania, `code` na wierzchu i oryginał w `cause` (z niego `serializeError` czyta
 * `details` i `hint` - tylko do logu, nigdy do odpowiedzi).
 *
 * Bez `import.meta`: moduł importują serwisy testowane w ts-jest.
 */
export class DatabaseError extends Error {
  readonly code?: string;
  // Pole jawnie, nie przez `super(message, { cause })`: testy kompilują się z `lib: ES2020`,
  // w którym `ErrorOptions` jeszcze nie istnieje.
  readonly cause?: unknown;

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "DatabaseError";
    this.code = options.code;
    this.cause = options.cause;
  }
}

/**
 * Zamienia błąd zwrócony przez Supabase na `DatabaseError`.
 *
 * `message` = `"<operation>: <oryginalny message>"` - oryginał zostaje w środku, więc asercje
 * `rejects.toThrow("<fragment>")` na treści błędu bazy dalej przechodzą. Wejście, które już jest
 * `DatabaseError`, wraca bez zmian: rzut przechodzący przez dwie metody serwisu nie dostaje
 * podwójnego prefiksu.
 *
 * @param error - Błąd z `{ error }` odpowiedzi Supabase (obiekt PostgREST, `Error` albo cokolwiek)
 * @param operation - Nazwa operacji, która go dostała, np. nazwa metody serwisu
 */
export function dbError(error: unknown, operation: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  let message: string;
  let code: string | undefined;

  if (typeof error === "string") {
    message = error;
  } else if (error !== null && typeof error === "object") {
    const source = error as Record<string, unknown>;
    message = typeof source.message === "string" ? source.message : "";
    code = typeof source.code === "string" && source.code !== "" ? source.code : undefined;
  } else {
    message = String(error);
  }

  const wrapped = new DatabaseError(`${operation}: ${message}`, { code, cause: error });

  // Stos zaczyna się w metodzie, która wywołała helper, nie w samym helperze.
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(wrapped, dbError);
  }

  return wrapped;
}
