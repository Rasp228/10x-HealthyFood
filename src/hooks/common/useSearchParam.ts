import { useSyncExternalStore } from "react";

/**
 * Zbiór subskrybentów store'a adresu.
 *
 * `history.pushState` i `history.replaceState` nie emitują żadnego zdarzenia, więc komponent,
 * który sam przepisuje query string, nie ma jak powiadomić hooka o zmianie. Trzymamy więc własną
 * listę nasłuchujących - dokładnie tak, jak `ThemeToggle.tsx` dla `localStorage`.
 */
const listeners = new Set<() => void>();

/** Powiadamia store o zmianie adresu wykonanej programowo (`pushState` / `replaceState`). */
export function notifySearchParamChange() {
  listeners.forEach((listener) => listener());
}

/**
 * Czyta parametr z query stringa bez ustawiania stanu w efekcie.
 *
 * `useSyncExternalStore` jest tu właściwym narzędziem, bo adres strony to zewnętrzne źródło
 * prawdy: podczas SSR i hydratacji React bierze migawkę serwerową (pusty query), a zaraz po niej
 * przełącza się na wartość z przeglądarki — bez ostrzeżenia o niezgodności hydratacji i bez
 * kaskady renderów, którą wywołuje `setState` w `useEffect`.
 */
function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  document.addEventListener("astro:after-swap", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
    document.removeEventListener("astro:after-swap", onStoreChange);
  };
}

const getSearch = () => window.location.search;
const getServerSearch = () => "";

export function useSearchParam(name: string): string | null {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);

  return new URLSearchParams(search).get(name);
}
