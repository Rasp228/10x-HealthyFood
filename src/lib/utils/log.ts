/**
 * Logowanie po stronie serwera: jedno zdarzenie = jedna linia JSON w `console.error` /
 * `console.warn` / `console.info`. Vercel zbiera stdout/stderr funkcji, więc linia z `requestId`
 * da się złączyć z wierszem żądania w panelu, a `env` i `commit` mówią, które wdrożenie ją wypisało.
 *
 * Bez `import.meta`: moduł importują serwisy testowane w ts-jest (CommonJS), a jedno `import.meta`
 * w grafie importu przewraca te testy na samym `import`. Tożsamość wdrożenia czytamy z
 * `process.env`, które Vercel ustawia w runtime funkcji.
 */

/** Wartości, które wolno włożyć do kontekstu - płasko, bez obiektów, żeby linia była przewidywalna. */
export type LogScalar = string | number | boolean | null | undefined;

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  step?: string;
  [key: string]: LogScalar;
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string | number;
  status?: number;
  details?: string;
  hint?: string;
  stack?: string;
  cause?: SerializedError;
}

type LogLevel = "error" | "warn" | "info";

/** Ile poziomów `cause` serializujemy pod błędem głównym - łańcuch bywa cykliczny. */
const MAX_CAUSE_DEPTH = 3;
const FAILING_ROW_PREFIX = "Failing row contains";

/** Pola linii, których kontekst nie może nadpisać. */
const DROPPED_CONTEXT_KEYS = new Set(["level", "event", "time", "env", "commit", "error"]);

/**
 * Każdy klucz z „email” w nazwie (`email`, `userEmail`, …): adres to dana osobowa, a do korelacji
 * wystarcza `userId`.
 */
const EMAIL_KEY = /email/i;

function deploymentIdentity(): { env: string; commit: string } {
  const env = typeof process !== "undefined" ? process.env : undefined;

  return {
    env: env?.VERCEL_ENV || "local",
    commit: env?.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
  };
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function serializeAtDepth(error: unknown, depth: number): SerializedError {
  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  if (error === null || typeof error !== "object") {
    return { name: "UnknownError", message: String(error) };
  }

  // `JSON.stringify(new Error())` daje `{}` (pola `Error` są nieprzeliczalne), a błąd PostgREST
  // bywa zwykłym obiektem - dlatego każde pole czytamy jawnie, zamiast serializować całość.
  const source = error as Record<string, unknown>;
  const serialized: SerializedError = {
    name: readString(source, "name") ?? "Error",
    message: readString(source, "message") ?? "",
  };

  const code = source.code;
  if ((typeof code === "string" && code !== "") || typeof code === "number") {
    serialized.code = code;
  }

  if (typeof source.status === "number") {
    serialized.status = source.status;
  }

  // `details` i `hint` z PostgREST zdradzają nazwy kolumn i ograniczeń - trafiają tylko do logu,
  // nigdy do ciała odpowiedzi. Wyjątek: DETAIL naruszenia CHECK/NOT NULL to
  // `Failing row contains (…)` z całym wierszem, czyli z treścią wpisu użytkownika - zostaje
  // sam prefiks, wartości do logu nie idą.
  const details = readString(source, "details");
  if (details) {
    serialized.details = details.startsWith(FAILING_ROW_PREFIX) ? `${FAILING_ROW_PREFIX} (redacted)` : details;
  }

  const hint = readString(source, "hint");
  if (hint) serialized.hint = hint;

  const stack = readString(source, "stack");
  if (stack) serialized.stack = stack;

  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = serializeAtDepth(source.cause, depth + 1);
  }

  return serialized;
}

/** Zamienia dowolny błąd (`Error`, obiekt PostgREST, napis, `undefined`) na zwykły obiekt do JSON. */
export function serializeError(error: unknown): SerializedError {
  return serializeAtDepth(error, 0);
}

/** Pole `error` pojawia się tylko wtedy, gdy wywołujący podał błąd. */
function write(level: LogLevel, event: string, context: LogContext, error: unknown) {
  const safeContext: Record<string, LogScalar> = {};

  for (const [key, value] of Object.entries(context)) {
    if (!DROPPED_CONTEXT_KEYS.has(key.toLowerCase()) && !EMAIL_KEY.test(key)) {
      safeContext[key] = value;
    }
  }

  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...deploymentIdentity(),
    ...safeContext,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  };

  console[level](JSON.stringify(line));
}

export function logError(event: string, context: LogContext, error?: unknown): void {
  write("error", event, context, error);
}

export function logWarn(event: string, context: LogContext, error?: unknown): void {
  write("warn", event, context, error);
}

export function logInfo(event: string, context: LogContext, error?: unknown): void {
  write("info", event, context, error);
}
