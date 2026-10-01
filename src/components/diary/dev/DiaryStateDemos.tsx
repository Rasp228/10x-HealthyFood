import React, { useEffect, useRef } from "react";
import DiaryEntryForm from "../DiaryEntryForm";
import DiaryEntryList from "../DiaryEntryList";
import type { DiaryEntryDto } from "@/types";

/**
 * Wyspy kitchen sinka `/dev/diary-states` - wyłącznie deweloperskie.
 *
 * Stany, które komponent trzyma we własnym `useState` (błąd walidacji formularza, błąd pola
 * kalorii przy wpisie), nie mają propsa, którym dałoby się je ustawić. Zamiast dokładać taki prop
 * do komponentów produkcyjnych, te wyspy **odgrywają** to, co zrobiłby użytkownik: po montażu
 * wpisują wartość w pole i klikają przycisk. Efekt dotyka tylko DOM-u (bez `setState` w efekcie),
 * a komponent dochodzi do stanu błędu własną ścieżką walidacji - bez żadnego żądania do API,
 * bo walidacja odrzuca dane, zanim cokolwiek zostanie wysłane.
 *
 * Handlery to no-opy. Funkcji nie da się przekazać z `.astro` do wyspy z `client:load`, stąd
 * osobne komponenty zamiast propsów w stronie.
 */

const noop = () => undefined;
const noopAsync = async () => undefined;

/** Dzień fixture'ów; formularz tylko go niesie, bo żaden zapis stąd nie wychodzi. */
const DAY = "2000-01-05";

/**
 * Wpisuje wartość w kontrolowane pole Reacta. Samo `input.value = …` omija tracker wartości
 * Reacta i `onChange` by nie zadziałał - stąd natywny setter z prototypu i zdarzenie `input`.
 */
function typeInto(field: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!field) return;

  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Formularz w stanie domyślnym. */
export function DiaryFormDefaultDemo() {
  return <DiaryEntryForm day={DAY} onCreated={noop} />;
}

/**
 * Formularz po nieudanej próbie zapisu: pusty opis i kalorie „abc”. Kliknięcie idzie w następnej
 * klatce, żeby handler przycisku widział już stan po wpisaniu wartości.
 */
export function DiaryFormValidationErrorDemo() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    typeInto(root.querySelector<HTMLInputElement>('[data-testid="diary-calories-input"]'), "abc");

    const frame = requestAnimationFrame(() => {
      root.querySelector<HTMLButtonElement>('[data-testid="diary-submit-button"]')?.click();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={rootRef}>
      <DiaryEntryForm day={DAY} onCreated={noop} />
    </div>
  );
}

/**
 * Formularz nieaktywny. Produkcyjnie blokuje go `isSubmitting` na czas `POST`, którego stąd nie
 * wysyłamy; `<fieldset disabled>` daje tę samą pseudoklasę `:disabled` na każdym polu
 * i przycisku, więc wygląd stanu jest ten sam - bez etykiety „Dodawanie...” ze spinnerem.
 */
export function DiaryFormDisabledDemo() {
  return (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0">
      <DiaryEntryForm day={DAY} onCreated={noop} />
    </fieldset>
  );
}

interface DiaryEntryFieldErrorDemoProps {
  entry: DiaryEntryDto;
}

/** Wiersz wpisu po próbie zapisania w polu kalorii wartości spoza zakresu (6000 kcal). */
export function DiaryEntryFieldErrorDemo({ entry }: DiaryEntryFieldErrorDemoProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) return;

    typeInto(root.querySelector<HTMLInputElement>('[data-testid="diary-entry-calories-input"]'), "6000");

    const frame = requestAnimationFrame(() => {
      root.querySelector<HTMLButtonElement>('[data-testid="diary-entry-calories-save"]')?.click();
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={rootRef}>
      <DiaryEntryList
        entries={[entry]}
        entryState={() => "idle"}
        inFlightId={null}
        deletingId={null}
        queuedIds={[]}
        onEstimate={noop}
        onCancel={noop}
        onSetCalories={noopAsync}
        onEdit={noop}
        onDelete={noop}
      />
    </div>
  );
}
