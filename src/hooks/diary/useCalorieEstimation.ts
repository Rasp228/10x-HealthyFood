import { useCallback, useEffect, useRef, useState } from "react";
import { reportClientError } from "../../lib/utils/client-error-reporter";
import {
  ESTIMATION_ABORT_MS,
  isEstimationFailureCode,
  type EstimationFailureCode,
} from "../../lib/utils/diary-estimation";

interface UseCalorieEstimationResult {
  /** Dokłada wpis do kolejki wycen. Wpis już w locie albo już w kolejce to no-op. */
  estimate: (entryId: number) => void;
  /** Przerywa żądanie w locie albo wyjmuje wpis z kolejki - zależnie od tego, gdzie akurat jest. */
  cancel: (entryId: number) => void;
  inFlightId: number | null;
  queuedIds: readonly number[];
  settledIds: ReadonlySet<number>;
  /**
   * Wpisy, których ostatnia wycena wróciła 502 z kodem "AI nie odpowiedziało". Kolejne `estimate`
   * dla wpisu zdejmuje go stąd, więc "Policz ponownie" wraca do "Liczę...".
   */
  failedIds: ReadonlyMap<number, EstimationFailureCode>;
}

/**
 * Jedno miejsce trzymające żądanie wyceny w locie, jego timeout i anulowanie - z tych samych
 * powodów, dla których `useAI` trzyma je dla ścieżki przepisów (wzorzec abortu: `useAI.ts:51-119`,
 * anulowanie: tamże `166-180`).
 *
 * **Wyceny idą kolejką FIFO, jedna na raz.** Bez tej decyzji drugie kliknięcie w trakcie pierwszej
 * wyceny robi jedną z dwóch złych rzeczy: po cichu przerywa pierwszą albo znika bez śladu. Cena
 * jest jawna - przy pięciu wpisach zleconych naraz ostatni czeka kilka minut - i rekompensuje ją
 * `DiaryEntryCalories`: pole na liczbę blokuje wyłącznie wpis faktycznie będący w locie, nigdy wpis
 * czekający w kolejce.
 *
 * **Bez retry.** Ponowienie jest kliknięciem użytkownika, nie decyzją hooka: każde wywołanie modelu
 * kosztuje, a wpis i tak zostaje z aktywnym polem na liczbę.
 *
 * `onSettled` woła się po **każdym** zakończeniu - sukces, anulowanie, timeout, błąd, 502 - żeby
 * lista pobrała wiersz w stanie faktycznym. Trasa `/estimate` oddaje wiersz także wtedy, gdy model
 * nie dał liczby, więc "nie policzono" jest zwykłym stanem danych, nie wyjątkiem.
 */
export function useCalorieEstimation(onSettled: () => void): UseCalorieEstimationResult {
  const [inFlightId, setInFlightId] = useState<number | null>(null);
  const [queuedIds, setQueuedIds] = useState<readonly number[]>([]);
  const [settledIds, setSettledIds] = useState<ReadonlySet<number>>(() => new Set<number>());
  const [failedIds, setFailedIds] = useState<ReadonlyMap<number, EstimationFailureCode>>(
    () => new Map<number, EstimationFailureCode>()
  );

  // Kolejka i wpis w locie żyją równolegle w refach, bo pętla drenująca czyta je między awaitami,
  // kiedy stan Reacta jest jeszcze sprzed przerenderowania.
  const queueRef = useRef<readonly number[]>([]);
  const inFlightRef = useRef<number | null>(null);
  const drainingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const disposedRef = useRef(false);
  const onSettledRef = useRef(onSettled);

  // `onSettled` przychodzi z wyspy jako świeża funkcja przy każdym renderze (`refetch` to domknięcie
  // nad `setState`). Pętla drenująca musi wołać tę najnowszą, a nie tę z chwili startu żądania,
  // więc trzymamy ją w refie i odświeżamy po renderze.
  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  // Wyspa znika razem ze swoją kolejką: dalsze wywołania modelu nie miałyby komu pokazać wyniku.
  // Przypisanie `false` w ciele efektu, a nie tylko w czyszczeniu, obsługuje podwójny montaż
  // w StrictMode - bez niego drugi montaż startowałby z kolejką uznaną za porzuconą.
  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Opróżnia kolejkę, jeden wpis na raz.
   *
   * Wejścia strzeże własna flaga, a nie `inFlightRef`: między wyzerowaniem wpisu w locie
   * a sprawdzeniem kolejki wywołujemy `onSettled`, więc gdyby ktoś zlecił stamtąd kolejną wycenę,
   * druga pętla ruszyłaby równolegle z tą i obie wysyłałyby żądania naraz.
   */
  const drain = useCallback(async () => {
    if (drainingRef.current) return;

    drainingRef.current = true;

    try {
      while (!disposedRef.current && queueRef.current.length > 0) {
        const [entryId, ...rest] = queueRef.current;

        queueRef.current = rest;
        setQueuedIds(rest);

        inFlightRef.current = entryId;
        setInFlightId(entryId);

        const controller = new AbortController();
        abortRef.current = controller;

        // Timeout mierzy czas **jednego żądania**, nie czekania w kolejce - wpis, który przeleżał
        // w niej trzy minuty, dostaje własny pełny budżet.
        const timeoutId = setTimeout(() => controller.abort(), ESTIMATION_ABORT_MS);

        try {
          const response = await fetch(`/api/diary-entries/${entryId}/estimate`, {
            method: "POST",
            credentials: "include", // Ważne dla przesyłania cookies z sesją
            signal: controller.signal,
          });

          // Nie ma tu czego rzucać - wpis i tak zostaje bez wartości z aktywnym polem - ale milczenie
          // kosztowało już raz. Bez logu i zgłoszenia 401, 404 i 502 przechodzą przez `finally`
          // nieodróżnialne od modelu, który po prostu nie dał liczby. 502 z kodem dostawcy dostaje
          // przy wpisie "AI niedostępne" zamiast "Nie policzono".
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const code: unknown = body.code;

            console.error(
              `Wycena kalorii dla wpisu ${entryId} nie powiodła się: HTTP ${response.status}`,
              code ?? body.error ?? ""
            );

            // Do logu serwera przez reporter - bez numeru wpisu w `source`, żeby deduplikacja po
            // `message + source` sklejała tę samą awarię dostawcy na kilku wpisach w jedno zgłoszenie.
            reportClientError({
              kind: "fetch",
              message: `Wycena kalorii: HTTP ${response.status}${typeof code === "string" ? ` ${code}` : ""}`,
              source: "POST /api/diary-entries/:id/estimate",
            });

            // Kod "AI nie odpowiedziało" zamienia przy wpisie "Nie policzono" na "AI niedostępne".
            if (isEstimationFailureCode(code) && !disposedRef.current) {
              setFailedIds((prev) => new Map(prev).set(entryId, code));
            }
          }
        } catch (error) {
          // Anulowanie i timeout to normalne zakończenia tej ścieżki, nie awarie - wpis wraca do
          // "Nie policzono" z aktywnym polem, a to widać na liście bez żadnego komunikatu.
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("Error estimating diary entry calories:", error);

            reportClientError({
              kind: "fetch",
              message: `Wycena kalorii: ${error instanceof Error ? error.message : String(error)}`,
              stack: error instanceof Error ? error.stack : undefined,
              source: "POST /api/diary-entries/:id/estimate",
            });
          }
        } finally {
          clearTimeout(timeoutId);
          abortRef.current = null;
          inFlightRef.current = null;

          // Sprzątanie przy odmontowaniu przerywa żądanie, więc `finally` biegnie także wtedy -
          // i bez tego strażnika wywoływałoby `refetch` dla drzewa, którego już nie ma, czyli
          // posyłało zbędny GET po wyjściu ze strony. Sprawdzenie przy `while` (wyżej) jest
          // o jedną instrukcję za późno: przerwana iteracja dociera tu zawsze. Warunek, a nie
          // `return`: `return` w `finally` połyka wszystko, co akurat leci w górę (`no-unsafe-finally`).
          if (!disposedRef.current) {
            setInFlightId(null);
            // Nowy zbiór, nie `add` na poprzednim: stan Reacta porównuje się przez tożsamość.
            setSettledIds((prev) => new Set(prev).add(entryId));

            onSettledRef.current();
          }
        }
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  const estimate = useCallback(
    (entryId: number) => {
      // Podwójne kliknięcie nie mnoży wywołań modelu.
      if (inFlightRef.current === entryId || queueRef.current.includes(entryId)) return;

      queueRef.current = [...queueRef.current, entryId];
      setQueuedIds(queueRef.current);

      // "Policz ponownie" musi wrócić do `live`, a nie zostać na `settled` - inaczej wpis pokazywałby
      // "Nie policzono" przez cały czas trwania drugiego żądania.
      setSettledIds((prev) => {
        if (!prev.has(entryId)) return prev;

        const next = new Set(prev);
        next.delete(entryId);

        return next;
      });

      // Nowe zlecenie zdejmuje "AI niedostępne" - wynik poprzedniej porażki nie mówi nic o tej próbie.
      setFailedIds((prev) => {
        if (!prev.has(entryId)) return prev;

        const next = new Map(prev);
        next.delete(entryId);

        return next;
      });

      void drain();
    },
    [drain]
  );

  const cancel = useCallback((entryId: number) => {
    if (inFlightRef.current === entryId) {
      // Przerwane żądanie kończy iterację pętli, a ta rusza z następnym wpisem sama.
      abortRef.current?.abort();
      return;
    }

    if (!queueRef.current.includes(entryId)) return;

    queueRef.current = queueRef.current.filter((id) => id !== entryId);
    setQueuedIds(queueRef.current);
  }, []);

  return { estimate, cancel, inFlightId, queuedIds, settledIds, failedIds };
}
