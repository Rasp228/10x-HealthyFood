import { useEffect } from "react";

/**
 * Hook zabezpieczający przed dostępem do stron chronionych po wylogowaniu
 * poprzez historię przeglądarki (przycisk "Wstecz")
 */
export const useSecurityGuard = () => {
  useEffect(() => {
    // Sprawdź czy użytkownik ma aktywną sesję
    const checkAuthStatus = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          // Brak autoryzacji - przekieruj na login (jak w middleware)
          window.location.replace("/auth/login");
        }
      } catch (error) {
        console.error("Błąd sprawdzania autoryzacji:", error);
        // W przypadku błędu połączenia, przekieruj na login
        window.location.replace("/auth/login");
      }
    };

    // Sprawdź autoryzację przy załadowaniu strony
    checkAuthStatus();

    // Nasłuchuj na zmiany w historii przeglądarki
    const handlePopState = () => {
      checkAuthStatus();
    };

    window.addEventListener("popstate", handlePopState);

    // Obsługa stanu nieaktywności strony
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAuthStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Funkcja pomocnicza do wymuszenia wylogowania
  const forceLogout = () => {
    localStorage.clear();
    sessionStorage.clear();

    // Wyczyść cache przeglądarki
    if ("caches" in window) {
      caches.keys().then(function (names) {
        for (const name of names) caches.delete(name);
      });
    }

    window.location.replace("/auth/login");
  };

  return { forceLogout };
};
