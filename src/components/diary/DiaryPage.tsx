import React, { useMemo, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import DayNavigator from "./DayNavigator";
import DiaryDaySummary from "./DiaryDaySummary";
import DiaryEntryForm from "./DiaryEntryForm";
import DiaryEntryList from "./DiaryEntryList";
import ToastContainer from "../feedback/ToastContainer";
import {
  ESTIMATION_TIMEOUT_MS,
  resolveEstimationState,
  type EstimationRequestPhase,
} from "@/lib/utils/diary-estimation";
import type { DiaryEntryDto } from "../../types";
import { useCalorieEstimation } from "../../hooks/diary/useCalorieEstimation";
import { useDiaryEntries } from "../../hooks/diary/useDiaryEntries";
import { useSelectedDay } from "../../hooks/diary/useSelectedDay";
import { useToast } from "../../hooks/common/useToast";

/** Rozdzielczość zegara wyspy. Świadomie zgrubna - patrz komentarz przy `createTickSubscriber`. */
const TICK_MS = 5_000;

/**
 * Store tykającej chwili: jedyne źródło `now` dla `resolveEstimationState`.
 *
 * Musiał powstać od zera, bo `useSelectedDay` subskrybuje `focus` i `visibilitychange` - zdarzenia
 * powrotu do karty. Dla granicy minuty to za mało: w karcie, której nikt nie dotyka, granica nigdy
 * by nie zapadła i wpis stałby na "Liczę..." bezterminowo.
 *
 * Interwał żyje tylko wtedy, gdy jest na co czekać. `deadline` to najpóźniejsza chwila, w której
 * czyjś znacznik przestaje być świeży; po niej interwał gasi się sam, bo dalsze budzenie Reacta
 * co pięć sekund nie zmieniłoby już żadnego stanu. Stan `estimating` wynikający z żywego żądania
 * tej wyspy zegara nie potrzebuje - kończy go odpowiedź, nie upływ czasu.
 *
 * Pięć sekund to rozdzielczość celowo zgrubna: granica minuty przesuwa się o najwyżej jeden tick,
 * a wpis i tak ma wtedy aktywne pole i przycisk "Policz ponownie".
 */
function createTickSubscriber(deadline: number) {
  return (onStoreChange: () => void) => {
    // Termin już minął albo nie ma go wcale - nie ma po co budzić Reacta ani na jeden tick.
    if (!Number.isFinite(deadline) || Date.now() >= deadline) return () => undefined;

    const intervalId = setInterval(() => {
      onStoreChange();

      if (Date.now() >= deadline) clearInterval(intervalId);
    }, TICK_MS);

    return () => clearInterval(intervalId);
  };
}

/**
 * Migawka **kwantyzowana**. Bez tego każdy odczyt zwracałby inną liczbę, `Object.is` nigdy nie
 * trafiłoby i `useSyncExternalStore` wpadłby w pętlę renderów. `useSelectedDay` rozwiązuje ten sam
 * problem tym, że jego migawka to napis dnia, identyczny między tickami; przy liczbie trzeba to
 * zrobić ręcznie.
 */
const getNowTick = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

/** Serwer nie zna chwili przeglądarki - zero, tak jak `useSelectedDay` oddaje `null`. */
const getServerNowTick = () => 0;

/**
 * Wyspa dziennika: spina wybór dnia z listą wpisów, trzyma żądania wyceny i powierzchnię toastów.
 *
 * `<ToastContainer />` renderuje się tutaj, a nie w layoucie - wyspy Astro to osobne drzewa
 * Reacta, więc komponent wołający `showToast` bez kontenera po prostu nie ma czym go narysować.
 */
export default function DiaryPage() {
  const { day, today, setDay } = useSelectedDay();
  const { entries, isLoading, error, refetch } = useDiaryEntries(day);
  const { showToast } = useToast();
  // Wyspa jest właścicielem żądania w locie, bo to ona trzyma listę: po każdym zakończeniu wycena
  // każe odświeżyć wiersze i stan wpisu bierze się z danych, a nie z pamięci komponentu.
  const { estimate, cancel, inFlightId, queuedIds, settledIds } = useCalorieEstimation(refetch);

  /** Co ta wyspa wie o żądaniu dla wpisu. Wpis w kolejce jest dla użytkownika "w toku", stąd `live`. */
  const phaseFor = (entryId: number): EstimationRequestPhase => {
    if (inFlightId === entryId || queuedIds.includes(entryId)) return "live";

    return settledIds.has(entryId) ? "settled" : "none";
  };

  // Najpóźniejsza granica minuty wśród wpisów, których stan rozstrzyga znacznik z bazy - czyli
  // tych po przeładowaniu strony. Liczona z samych danych, bez czytania zegara w renderze.
  const tickDeadline = entries.reduce((latest, entry) => {
    if (entry.calories !== null || entry.estimation_requested_at === null) return latest;
    if (phaseFor(entry.id) !== "none") return latest;

    // Nieparsowalny znacznik pomijamy, zamiast wpuszczać `NaN` do `Math.max` - stamtąd zatruwałby
    // całą redukcję i zegar nie ruszyłby dla ŻADNEGO wpisu tego dnia. `resolveEstimationState`
    // ten sam przypadek obsługuje i schodzi na `stale`; tutaj musi być tak samo, inaczej jej
    // obsługa jest pozorna.
    const requestedAt = Date.parse(entry.estimation_requested_at);

    if (!Number.isFinite(requestedAt)) return latest;

    return Math.max(latest, requestedAt + ESTIMATION_TIMEOUT_MS);
  }, Number.NEGATIVE_INFINITY);

  const subscribeToTick = useMemo(() => createTickSubscriber(tickDeadline), [tickDeadline]);
  const now = useSyncExternalStore(subscribeToTick, getNowTick, getServerNowTick);

  const entryState = (entry: DiaryEntryDto) => resolveEstimationState(entry, now, phaseFor(entry.id));

  /** Wpis zapisany przyciskiem "Zapisz i policz kalorie" dostaje wycenę od razu. */
  const handleCreated = (createdEntryId?: number) => {
    refetch();

    if (createdEntryId !== undefined) {
      estimate(createdEntryId);
    }
  };

  const handleSetCalories = async (entryId: number, calories: number) => {
    try {
      const response = await fetch(`/api/diary-entries/${entryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Ważne dla przesyłania cookies z sesją
        body: JSON.stringify({ calories }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Wpis ma już liczbę, więc nie ma po co pytać o nią modelu - jeśli czekał w kolejce, wypada
      // z niej przed wysłaniem. Wartości w locie to nie dotyczy: przy niej pole jest nieaktywne,
      // a spóźnione oszacowanie i tak nie nadpisze liczby (zapis warunkowy w `applyEstimate`).
      cancel(entryId);
      refetch();
      showToast("Kalorie zostały zapisane", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wystąpił błąd podczas zapisywania kalorii";
      showToast(message, "error");
    }
  };

  // Dzień rozstrzyga przeglądarka, więc do czasu pierwszej migawki klienckiej nie mamy czego
  // pokazać. Policzenie "dzisiaj" na serwerze dałoby dzień serwera i rozjechałoby hydratację.
  if (day === null || today === null) {
    return <LoadingSpinner className="py-8" message="Ładowanie dziennika..." />;
  }

  return (
    <div data-testid="diary-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Dziennik posiłków</h1>
        <DayNavigator day={day} today={today} onChange={setDay} />
      </div>

      <DiaryEntryForm day={day} onCreated={handleCreated} />

      <div className="mt-6">
        {error ? (
          <div
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950"
            data-testid="diary-error-state"
          >
            <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Wystąpił błąd</h3>
            <p className="text-red-600 dark:text-red-400">{error.message}</p>
            <Button
              variant="outline"
              className="mt-4 border-red-200 text-red-600 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900"
              onClick={() => refetch()}
              data-testid="diary-retry-button"
            >
              Spróbuj ponownie
            </Button>
          </div>
        ) : isLoading ? (
          <LoadingSpinner className="py-8" message="Ładowanie wpisów..." />
        ) : entries.length === 0 ? (
          <div
            className="rounded-lg border-2 border-dashed border-muted p-12 text-center"
            data-testid="diary-empty-state"
          >
            <h3 className="mb-2 text-xl font-medium">Brak wpisów</h3>
            <p className="text-muted-foreground">Ten dzień nie ma jeszcze żadnych wpisów.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <DiaryDaySummary entries={entries} />
            <DiaryEntryList
              entries={entries}
              entryState={entryState}
              inFlightId={inFlightId}
              queuedIds={queuedIds}
              onEstimate={estimate}
              onCancel={cancel}
              onSetCalories={handleSetCalories}
            />
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  );
}
