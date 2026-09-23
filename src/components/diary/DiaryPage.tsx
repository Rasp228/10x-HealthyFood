import React from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import DayNavigator from "./DayNavigator";
import DiaryDaySummary from "./DiaryDaySummary";
import DiaryEntryForm from "./DiaryEntryForm";
import DiaryEntryList from "./DiaryEntryList";
import ToastContainer from "../feedback/ToastContainer";
import { useDiaryEntries } from "../../hooks/diary/useDiaryEntries";
import { useSelectedDay } from "../../hooks/diary/useSelectedDay";

/**
 * Wyspa dziennika: spina wybór dnia z listą wpisów i trzyma powierzchnię toastów.
 *
 * `<ToastContainer />` renderuje się tutaj, a nie w layoucie - wyspy Astro to osobne drzewa
 * Reacta, więc komponent wołający `showToast` bez kontenera po prostu nie ma czym go narysować.
 */
export default function DiaryPage() {
  const { day, today, setDay } = useSelectedDay();
  const { entries, isLoading, error, refetch } = useDiaryEntries(day);

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

      <DiaryEntryForm day={day} onCreated={refetch} />

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
            <DiaryEntryList entries={entries} />
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  );
}
