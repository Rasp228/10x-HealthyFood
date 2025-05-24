import React, { useState } from "react";
import { Button } from "@/components/ui/button";

interface LogoutButtonProps {
  className?: string;
}

export default function LogoutButton({ className }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        // Przekierowanie po pomyślnym wylogowaniu
        window.location.href = "/auth/login";
      } else {
        console.error("Błąd podczas wylogowania");
        // Fallback - przekieruj mimo błędu
        window.location.href = "/auth/login";
      }
    } catch (error) {
      console.error("Błąd połączenia podczas wylogowania:", error);
      // Fallback - przekieruj mimo błędu
      window.location.href = "/auth/login";
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleLogout} disabled={isLoading} className={className}>
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Wylogowywanie...
        </span>
      ) : (
        "Wyloguj"
      )}
    </Button>
  );
}
