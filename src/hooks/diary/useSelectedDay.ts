import { useCallback, useEffect, useSyncExternalStore } from "react";
import { notifySearchParamChange, useSearchParam } from "../common/useSearchParam";
import { isAfter, toLocalDay } from "../../lib/utils/diary-day";
import { entryDateSchema } from "../../lib/validations/diary/create-entry";

const DAY_PARAM = "date";

interface UseSelectedDayResult {
  day: string | null;
  today: string | null;
  setDay: (next: string) => void;
}

/**
 * "Dziś" to stan spoza Reacta - zegar przeglądarki - więc czytamy go tą samą drogą co query
 * string. Migawka serwerowa mówi `null`: policzone na serwerze "dziś" byłoby dniem serwera
 * i rozjechałoby hydratację, gdy zegary stoją po dwóch stronach północy.
 *
 * Subskrypcja nie jest ozdobą. Bez niej karta otwarta przed północą trzyma wczoraj jako "dziś"
 * do końca życia wyspy, a posiłek wpisany o 00:10 dostaje wczorajszą datę - dokładnie ta pomyłka,
 * przed którą ostrzega komentarz w migracji `20260922140906_create_diary_entries.sql:29-31`,
 * tylko liczona zegarem ściennym zamiast strefą. `focus` i `visibilitychange` to momenty,
 * w których użytkownik wraca do karty, czyli jedyne, w których nowy dzień ma kogo obchodzić.
 */
function subscribeToToday(onStoreChange: () => void) {
  window.addEventListener("focus", onStoreChange);
  document.addEventListener("visibilitychange", onStoreChange);

  return () => {
    window.removeEventListener("focus", onStoreChange);
    document.removeEventListener("visibilitychange", onStoreChange);
  };
}

// Napis, nie obiekt: `useSyncExternalStore` porównuje migawki przez `Object.is`, a dwa równe
// napisy są tożsame, więc świeże wywołanie `toLocalDay` nie wywołuje pętli renderów.
const getToday = () => toLocalDay(new Date());
const getServerToday = (): string | null => null;

/** Zapisuje dzień do adresu i budzi store `useSearchParam`. */
function writeDayToUrl(day: string, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.set(DAY_PARAM, day);

  if (mode === "push") {
    window.history.pushState(window.history.state, "", url);
  } else {
    window.history.replaceState(window.history.state, "", url);
  }

  // Bez tego wywołania strzałki wyglądają na martwe: `pushState` nie emituje `popstate`,
  // a `useSearchParam` nasłuchuje tylko `popstate` i `astro:after-swap`, więc store nigdy
  // nie przeczytałby nowego dnia. Ten sam wzorzec co `notifyThemeChange` w `ThemeToggle.tsx:61-63`
  // - własny notyfikator zamiast syntetycznego zdarzenia, które obudziłoby też `useSecurityGuard`
  // i kosztowało zapytanie do `/api/auth/me` przy każdej zmianie dnia.
  notifySearchParamChange();
}

/**
 * Dzień z adresu nadaje się do pokazania tylko wtedy, gdy naprawdę istnieje i nie jest z
 * przyszłości. Sam `isAfter` porównuje napisy, więc `2026-02-31` - data poprawna składniowo,
 * której nie ma w kalendarzu - sortuje się przed dzisiaj i weszłaby do panelu, a stamtąd do
 * zapytania, które route słusznie odbija czterysetką. Ten sam schemat rozstrzyga to na routcie.
 */
function isUsableDay(requestedDay: string, today: string): boolean {
  return entryDateSchema.safeParse(requestedDay).success && !isAfter(requestedDay, today);
}

function resolveDay(requestedDay: string | null, today: string | null): string | null {
  if (today === null) return null;
  if (requestedDay === null) return today;

  return isUsableDay(requestedDay, today) ? requestedDay : today;
}

/**
 * Wybrany dzień dziennika, trzymany w query stringu, żeby przetrwał odświeżenie i dał się
 * podesłać linkiem.
 */
export function useSelectedDay(): UseSelectedDayResult {
  const today = useSyncExternalStore(subscribeToToday, getToday, getServerToday);
  const requestedDay = useSearchParam(DAY_PARAM);

  const day = resolveDay(requestedDay, today);
  const shouldCorrectUrl = today !== null && requestedDay !== null && !isUsableDay(requestedDay, today);

  // Prawdziwa bramka na daty - i te z przyszłości, i te nieistniejące - jest tutaj, nie w
  // atrybucie `max` pola daty: dzień dociera do panelu z query stringa, który przez to pole nigdy
  // nie przechodzi. Panel pokazuje już dzisiaj, więc zostaje poprawić adres - `replaceState`, bo
  // to korekta, a nie krok w historii, do którego "wstecz" miałoby wracać.
  useEffect(() => {
    if (!shouldCorrectUrl || today === null) return;

    writeDayToUrl(today, "replace");
  }, [shouldCorrectUrl, today]);

  const setDay = useCallback((next: string) => {
    writeDayToUrl(next, "push");
  }, []);

  return { day, today, setDay };
}
