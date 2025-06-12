import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface LogoutButtonProps {
  className?: string;
}

export default function LogoutButton({ className }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);

    try {
      // Wyczyść localStorage i sessionStorage przed wywołaniem API
      localStorage.clear();
      sessionStorage.clear();

      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Błąd podczas wylogowania");
      }

      // Wyczyść cache przeglądarki dla bezpieczeństwa
      if ("caches" in window) {
        caches.keys().then(function (names) {
          for (const name of names) caches.delete(name);
        });
      }

      // Użyj window.location.replace zamiast href aby zapobiec powrotowi poprzez "Wstecz"
      window.location.replace("/auth/login");
    } catch (error) {
      console.error("Błąd połączenia podczas wylogowania:", error);
      // Fallback - wyczyść storage i przekieruj mimo błędu
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("/auth/login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleLogout} disabled={isLoading} size="sm" variant="outline" className={className}>
      {isLoading ? (
        <span className="flex items-center gap-2">
          <LoadingSpinner size="sm" />
          Wylogowywanie...
        </span>
      ) : (
        "Wyloguj"
      )}
    </Button>
  );
}
