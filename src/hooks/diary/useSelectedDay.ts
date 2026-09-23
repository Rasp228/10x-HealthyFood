import { useCallback, useEffect, useSyncExternalStore } from "react";
import { notifySearchParamChange, useSearchParam } from "../common/useSearchParam";
import { isAfter, toLocalDay } from "../../lib/utils/diary-day";

const DAY_PARAM = "date";

interface UseSelectedDayResult {
  day: string | null;
  today: string | null;
  setDay: (next: string) => void;
}

/**
 * "Czy jesteśmy już w przeglądarce" to również stan spoza Reacta, więc czytamy go tą samą
 * drogą co query string: migawka serwerowa mówi `false`, migawka kliencka `true`. Dzięki temu
 * "dziś" nigdy nie powstaje na serwerze - policzone tam byłoby dniem serwera i rozjechałoby
 * hydratację, gdy zegary stoją po dwóch stronach północy.
 */
const subscribeToNothing = () => () => undefined;
const getIsClient = () => true;
const getServerIsClient = () => false;

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

function resolveDay(requestedDay: string | null, today: string | null): string | null {
  if (today === null) return null;
  if (requestedDay === null) return today;

  return isAfter(requestedDay, today) ? today : requestedDay;
}

/**
 * Wybrany dzień dziennika, trzymany w query stringu, żeby przetrwał odświeżenie i dał się
 * podesłać linkiem.
 */
export function useSelectedDay(): UseSelectedDayResult {
  const isClient = useSyncExternalStore(subscribeToNothing, getIsClient, getServerIsClient);
  const requestedDay = useSearchParam(DAY_PARAM);

  const today = isClient ? toLocalDay(new Date()) : null;
  const day = resolveDay(requestedDay, today);
  const shouldClamp = today !== null && requestedDay !== null && isAfter(requestedDay, today);

  // Prawdziwa bramka na daty z przyszłości jest tutaj, nie w atrybucie `max` pola daty: dzień
  // dociera do panelu z query stringa, który przez to pole nigdy nie przechodzi. Panel pokazuje
  // już dzisiaj, więc zostaje poprawić adres - `replaceState`, bo to korekta, a nie krok
  // w historii, do którego "wstecz" miałoby wracać.
  useEffect(() => {
    if (!shouldClamp || today === null) return;

    writeDayToUrl(today, "replace");
  }, [shouldClamp, today]);

  const setDay = useCallback((next: string) => {
    writeDayToUrl(next, "push");
  }, []);

  return { day, today, setDay };
}
