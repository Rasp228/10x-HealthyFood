import React from "react";

/**
 * Szkielet dziennika do czasu hydratacji: nagłówek i bloki w miejscu nawigatora dnia, sumy
 * i formularza, zamiast samotnego spinnera.
 *
 * **Bez `data-testid="diary-page"`** - E2E czeka na ten testid jako sygnał zhydratowanej wyspy,
 * więc szkielet z nim wpuściłby testy przed hydratacją.
 */
export default function DiaryPageSkeleton() {
  return (
    <div data-testid="diary-page-skeleton" aria-busy="true">
      <span className="sr-only" aria-live="polite">
        Ładowanie dziennika…
      </span>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Dziennik posiłków</h1>
        <div className="h-9 w-full animate-pulse rounded-md bg-muted sm:w-80" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-6" aria-hidden="true">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
