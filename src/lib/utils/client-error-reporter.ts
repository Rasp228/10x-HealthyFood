/**
 * Reporter błędów przeglądarki: zbiera zdarzenia i wysyła je do `POST /api/client-errors`, skąd
 * trafiają do tego samego kanału co błędy serwera (linia `client.<kind>` w Vercel logs).
 *
 * Granice są celowo ciasne, bo pętla błędów w przeglądarce nie może zalać funkcji Vercela:
 * najwyżej `MAX_CLIENT_ERROR_EVENTS` zdarzeń na załadowanie dokumentu, deduplikacja po
 * `message + source`, ciało poniżej `MAX_CLIENT_ERROR_BODY_BYTES`. Te same limity pilnuje trasa
 * (`src/lib/validations/client-errors/report.ts`) - reporter przycina, żeby nie wysyłać czegoś,
 * co trasa i tak odrzuci.
 *
 * Stan żyje w module, nie w komponencie: `ClientRouter` nie przeładowuje dokumentu, więc moduł
 * (i limit) trwa przez całą sesję karty, a wyspy Reacta to osobne drzewa, które i tak nie
 * dzieliłyby kontekstu.
 */
import {
  CLIENT_ERROR_MESSAGE_MAX,
  CLIENT_ERROR_STACK_MAX,
  MAX_CLIENT_ERROR_BODY_BYTES,
  MAX_CLIENT_ERROR_EVENTS,
  type ClientErrorEvent,
} from "../validations/client-errors/report";

export const CLIENT_ERRORS_ENDPOINT = "/api/client-errors";

/** Co wołający wie o błędzie; ścieżkę strony i chwilę dokłada reporter. */
export interface ClientErrorInput {
  kind: ClientErrorEvent["kind"];
  message: string;
  stack?: string;
  source?: string;
}

/** Ile czekamy na kolejne błędy, zanim wyślemy paczkę - jeden wyjątek często ciągnie kolejne. */
const FLUSH_DELAY_MS = 1_000;

/** Najkrótszy ślad stosu, jaki zostawiamy przy przycinaniu do limitu ciała. */
const MIN_STACK_CHARS = 200;

/** Strażnik na `window`: handlery globalne rejestrujemy raz na dokument, nie raz na nawigację. */
const INSTALLED_FLAG = "__healthyMealClientErrorReporter";

const pending: ClientErrorEvent[] = [];
const seen = new Set<string>();
let accepted = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const truncate = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

/** Anulowanie (`AbortController`, timeout wyceny) to zwykłe zakończenie, nie błąd do zgłoszenia. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError"
  );
}

/**
 * Ciało żądania w granicach limitu. Najpierw skracamy najdłuższe ślady stosu (są najmniej
 * potrzebne z całego zdarzenia), a gdy to nie wystarcza - odrzucamy zdarzenia od końca.
 */
function buildBody(events: ClientErrorEvent[]): string | null {
  const batch = events.map((event) => ({ ...event }));
  let body = JSON.stringify({ events: batch });

  while (byteLength(body) > MAX_CLIENT_ERROR_BODY_BYTES) {
    const longest = batch.reduce<ClientErrorEvent | null>(
      (current, event) => ((event.stack?.length ?? 0) > (current?.stack?.length ?? 0) ? event : current),
      null
    );

    if (longest?.stack) {
      longest.stack =
        longest.stack.length > MIN_STACK_CHARS ? longest.stack.slice(0, longest.stack.length / 2) : undefined;
    } else if (batch.length > 1) {
      batch.pop();
    } else {
      return null;
    }

    body = JSON.stringify({ events: batch });
  }

  return body;
}

/** Wysyła bufor. Błąd samego wysyłania połykamy - zgłaszanie go zapętliłoby reporter. */
function flush() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (pending.length === 0) return;

  const body = buildBody(pending.splice(0));

  if (body === null) return;

  // Napis, nie Blob z `application/json`: `sendBeacon` wysyła go jako `text/plain`, czyli typ
  // bezpieczny dla CORS, którego żadna przeglądarka nie odrzuca. Trasa czyta surowy tekst.
  const sent =
    typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
      ? navigator.sendBeacon(CLIENT_ERRORS_ENDPOINT, body)
      : false;

  if (sent) return;

  void fetch(CLIENT_ERRORS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => undefined);
}

/**
 * Zgłasza błąd przeglądarki. Bez wysyłki dla `AbortError`, dla powtórki tego samego
 * `message + source` i po wyczerpaniu limitu zdarzeń na załadowanie strony.
 */
export function reportClientError(input: ClientErrorInput): void {
  if (typeof window === "undefined") return;

  const message = truncate(input.message.trim() || "Nieznany błąd", CLIENT_ERROR_MESSAGE_MAX);
  const source = input.source ? truncate(input.source, CLIENT_ERROR_MESSAGE_MAX) : undefined;
  const key = `${message}\u0000${source ?? ""}`;

  if (seen.has(key) || accepted >= MAX_CLIENT_ERROR_EVENTS) return;

  seen.add(key);
  accepted += 1;

  pending.push({
    kind: input.kind,
    message,
    stack: input.stack ? truncate(input.stack, CLIENT_ERROR_STACK_MAX) : undefined,
    source,
    path: truncate(window.location.pathname || "/", CLIENT_ERROR_MESSAGE_MAX),
    at: new Date().toISOString(),
  });

  flushTimer ??= setTimeout(flush, FLUSH_DELAY_MS);
}

/** Opis dowolnej wartości rzuconej albo odrzuconej - `reason` obietnicy nie musi być `Error`. */
function describeThrown(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack };
  }

  if (typeof value === "string") return { message: value };

  try {
    return { message: JSON.stringify(value) ?? String(value) };
  } catch {
    return { message: String(value) };
  }
}

function handleError(event: ErrorEvent) {
  if (isAbortError(event.error)) return;

  const described = event.error !== undefined && event.error !== null ? describeThrown(event.error) : undefined;
  const location = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined;

  reportClientError({
    kind: "error",
    message: described?.message || event.message || "Nieznany błąd",
    stack: described?.stack,
    source: location,
  });
}

function handleRejection(event: PromiseRejectionEvent) {
  if (isAbortError(event.reason)) return;

  reportClientError({ kind: "unhandledrejection", ...describeThrown(event.reason) });
}

/**
 * Rejestruje globalne `error` i `unhandledrejection` - raz na dokument. Skrypt layoutu może się
 * wykonać ponownie (np. po zmianie layoutu przy nawigacji `ClientRouter`), a podwójny handler
 * wysyłałby każde zdarzenie dwa razy, dlatego strażnik siedzi na `window`, nie w module.
 */
export function installGlobalHandlers(): void {
  if (typeof window === "undefined") return;

  const registry = window as unknown as Record<string, unknown>;

  if (registry[INSTALLED_FLAG]) return;

  registry[INSTALLED_FLAG] = true;

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);
  // Zamknięcie karty nie może zgubić bufora - `sendBeacon` jest właśnie na tę chwilę.
  window.addEventListener("pagehide", flush);
}
