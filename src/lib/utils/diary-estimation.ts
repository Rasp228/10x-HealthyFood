import type { DiaryEntryDto } from "../../types";

/**
 * Granica z kryterium akceptacji US-01: po minucie bez wartości wpis czyta się jako niepoliczony.
 * Znacznik w bazie nigdy nie jest zerowany, więc "przepadło" jest funkcją czasu po stronie
 * klienta - ta stała jest całą tą funkcją.
 */
export const ESTIMATION_TIMEOUT_MS = 60_000;

/**
 * Po tylu milisekundach przeglądarka przerywa własne żądanie.
 *
 * Zapas ponad minutę jest celowy: gdyby abort przypadał dokładnie na granicy, przeglądarka ucinałaby
 * wywołanie, na które serwer ma jeszcze budżet, i wpis kończyłby bez wartości mimo poprawnej
 * odpowiedzi modelu.
 */
export const ESTIMATION_ABORT_MS = 65_000;

/**
 * Stałe uprzedzenie pokazywane przy każdym przycisku zlecającym wycenę - i w formularzu, i przy
 * wpisie na liście. Jedno zdanie w jednym miejscu, bo dwie kopie rozjechałyby się przy pierwszej
 * korekcie, a to jest informacja o tym, że treść wpisu opuszcza tę aplikację.
 *
 * Zdania są dwa, bo ścieżki wyceny są dwie i wysyłają co innego. Który warunek wybiera które:
 * - przy wierszu listy - `entry.source_recipe_id !== null` (wpis jest już zapisany),
 * - w formularzu - `selectedRecipe !== null` (wiersza jeszcze nie ma, więc nie ma czego pytać).
 */
export const AI_NOTICE = "Opis posiłku zostanie wysłany do dostawcy modelu.";

/** Wariant dla wpisu z własnego przepisu: do dostawcy jedzie cała treść przepisu, nie sam opis. */
export const AI_NOTICE_RECIPE = "Treść przepisu i Twój opis zostaną wysłane do dostawcy modelu.";

/**
 * Co ta konkretna wyspa wie o żądaniu dla danego wpisu.
 *
 * Trójstanowe, nie boolowskie, i to jest sedno sprawy:
 * - `live` - wyspa ma dla tego wpisu żądanie w locie albo w kolejce,
 * - `settled` - wyspa zleciła wycenę i żądanie **już wróciło bez wartości** (200 bez liczby albo 502),
 * - `none` - wyspa nic o tym wpisie nie wie: albo nigdy nie zlecała, albo stronę przeładowano.
 */
export type EstimationRequestPhase = "live" | "settled" | "none";

/**
 * Kody, którymi trasa `/estimate` mówi 502 "dostawca modelu nie odpowiedział": `AI_UNAVAILABLE`
 * (odmowa, limit, sieć) i `AI_MISCONFIGURED` (brak klucza po stronie serwera). Tylko te dwa
 * zamieniają "Nie policzono" na "AI niedostępne" - inne porażki (401, 404) zostają zwykłym `stale`.
 */
export const ESTIMATION_FAILURE_CODES = ["AI_UNAVAILABLE", "AI_MISCONFIGURED"] as const;

export type EstimationFailureCode = (typeof ESTIMATION_FAILURE_CODES)[number];

export function isEstimationFailureCode(value: unknown): value is EstimationFailureCode {
  return typeof value === "string" && (ESTIMATION_FAILURE_CODES as readonly string[]).includes(value);
}

/**
 * Pięć stanów, w jakich może być wartość kaloryczna wpisu z punktu widzenia interfejsu.
 * `unavailable` to `stale` z wiedzą, dlaczego: model nie odpowiedział, więc użytkownik ma co
 * zgłosić, zamiast zgadywać, czy wpis był po prostu nie do policzenia.
 */
export type EstimationState = "valued" | "estimating" | "stale" | "unavailable" | "idle";

/**
 * Stan wartości wpisu: czysta funkcja wiersza, chwili i wiedzy wyspy o żądaniu.
 *
 * `now` przychodzi argumentem, a nie z `Date.now()` w środku - dzięki temu reguła "minuta od
 * znacznika" daje się sprawdzić bez renderowania i bez zegara systemowego, tak jak `summarizeDay`
 * i `toLocalDay`.
 *
 * Znacznik z bazy jest tu **źródłem rezerwowym, nie nadrzędnym**: rozstrzyga wyłącznie przy `none`,
 * gdzie odtwarza wiedzę utraconą przy przeładowaniu strony. Gdyby rozstrzygał zawsze, wycena
 * odpadająca po kilku sekundach (nieprawidłowy klucz, brak sieci) trzymałaby wpis na "Liczę..."
 * przez resztę minuty, choć żaden request już nie żyje - a razem z blokadą pola zamykałaby jedyne
 * wyjście, które FR-004 każe trzymać otwarte.
 *
 * Znacznik nie do odczytania (`NaN` z `Date.parse`) wychodzi stąd jako `stale`: lepiej pokazać
 * aktywne pole i "Policz ponownie" niż zawiesić wpis na "Liczę..." bez końca.
 *
 * `failureCode` liczy się tylko przy `settled`: kod jest wiedzą tej wyspy o żądaniu, które już
 * wróciło, a nie o wierszu. Sprawdzany przed znacznikiem: trasa zapisuje go przed wywołaniem
 * modelu, ale gdyby tej kolejności zabrakło, wpis i tak ma powiedzieć, że AI nie odpowiedziało.
 */
export function resolveEstimationState(
  entry: DiaryEntryDto,
  now: number,
  phase: EstimationRequestPhase,
  failureCode: EstimationFailureCode | null = null
): EstimationState {
  if (entry.calories !== null) return "valued";

  if (phase === "live") return "estimating";

  if (phase === "settled" && failureCode !== null) return "unavailable";

  if (entry.estimation_requested_at === null) return "idle";

  if (phase === "settled") return "stale";

  const requestedAt = Date.parse(entry.estimation_requested_at);

  return now - requestedAt < ESTIMATION_TIMEOUT_MS ? "estimating" : "stale";
}
