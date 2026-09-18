import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

/**
 * Wybrany motyw żyje poza Reactem - w localStorage i w preferencji systemowej - więc czytamy go
 * przez `useSyncExternalStore`, a nie przez `setState` w efekcie. Podczas SSR i hydratacji
 * obowiązuje migawka serwerowa (jasny motyw), zaraz po niej React przełącza się na wartość
 * z przeglądarki.
 */
const listeners = new Set<() => void>();

function notifyThemeChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  listeners.add(onStoreChange);
  mediaQuery.addEventListener("change", onStoreChange);
  document.addEventListener("astro:after-swap", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    mediaQuery.removeEventListener("change", onStoreChange);
    document.removeEventListener("astro:after-swap", onStoreChange);
  };
}

function getIsDark() {
  const theme = localStorage.getItem("theme");

  return theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

const getServerIsDark = () => false;

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getIsDark, getServerIsDark);
  const isFirstSync = useRef(true);

  // Klasa na <html> to efekt uboczny, nie stan. Pierwsza synchronizacja ustawia klasę wprost,
  // kolejne tylko przełączają - dzięki temu wejście na stronę nie dotyka DOM bez potrzeby.
  useEffect(() => {
    if (isFirstSync.current) {
      isFirstSync.current = false;

      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }

      return;
    }

    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const toggleTheme = () => {
    localStorage.setItem("theme", isDark ? "light" : "dark");
    // localStorage nie emituje zdarzenia we własnej karcie - powiadamiamy store ręcznie.
    notifyThemeChange();
  };

  return (
    <Button
      id="theme-toggle"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full"
      aria-label={isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="dark:hidden"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hidden dark:block"
      >
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2"></path>
        <path d="M12 20v2"></path>
        <path d="m4.93 4.93 1.41 1.41"></path>
        <path d="m17.66 17.66 1.41 1.41"></path>
        <path d="M2 12h2"></path>
        <path d="M20 12h2"></path>
        <path d="m6.34 17.66-1.41 1.41"></path>
        <path d="m19.07 4.93-1.41 1.41"></path>
      </svg>
    </Button>
  );
}
