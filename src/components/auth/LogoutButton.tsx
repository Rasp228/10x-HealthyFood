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
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Błąd podczas wylogowania");
      }

      // Przekierowanie po wylogowaniu
      window.location.href = "/auth/login";
    } catch (error) {
      console.error("Błąd połączenia podczas wylogowania:", error);
      // Fallback - przekieruj mimo błędu
      window.location.href = "/auth/login";
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
