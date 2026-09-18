import { useSyncExternalStore } from "react";

/**
 * Czyta parametr z query stringa bez ustawiania stanu w efekcie.
 *
 * `useSyncExternalStore` jest tu właściwym narzędziem, bo adres strony to zewnętrzne źródło
 * prawdy: podczas SSR i hydratacji React bierze migawkę serwerową (pusty query), a zaraz po niej
 * przełącza się na wartość z przeglądarki — bez ostrzeżenia o niezgodności hydratacji i bez
 * kaskady renderów, którą wywołuje `setState` w `useEffect`.
 */
function subscribe(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  document.addEventListener("astro:after-swap", onStoreChange);

  return () => {
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
