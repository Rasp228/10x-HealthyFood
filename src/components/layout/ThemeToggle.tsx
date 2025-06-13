import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  // Funkcja do synchronizacji motywu z DOM
  const syncThemeWithDOM = () => {
    const theme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldBeDark = theme === "dark" || (!theme && prefersDark);

    // Synchronizuj DOM
    if (shouldBeDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    return shouldBeDark;
  };

  useEffect(() => {
    // Synchronizuj motyw przy inicjalizacji
    const initialIsDark = syncThemeWithDOM();
    setIsDark(initialIsDark);

    // Nasłuchuj zmian w preferencjach systemowych
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) {
        setIsDark(e.matches);
        document.documentElement.classList.toggle("dark", e.matches);
      }
    };

    // Nasłuchuj przejść między stronami Astro
    const handleAstroSwap = () => {
      const newIsDark = syncThemeWithDOM();
      setIsDark(newIsDark);
    };

    mediaQuery.addEventListener("change", handleChange);
    document.addEventListener("astro:after-swap", handleAstroSwap);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      document.removeEventListener("astro:after-swap", handleAstroSwap);
    };
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle("dark", newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
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
