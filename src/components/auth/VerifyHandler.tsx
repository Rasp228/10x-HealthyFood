import { useEffect } from "react";

interface VerifyHandlerProps {
  onSuccess: () => void;
  onResetSuccess: () => void;
  onError: (message: string) => void;
}

export function VerifyHandler({ onSuccess, onResetSuccess, onError }: VerifyHandlerProps) {
  useEffect(() => {
    const handleVerification = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const type = urlParams.get("type");

      if (!code) {
        onError("Brak kodu weryfikacyjnego w linku");
        return;
      }

      try {
        const response = await fetch("/api/auth/exchange-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
          onError(data.error || "Wystąpił błąd podczas weryfikacji");
          return;
        }

        if (type === "recovery" || type === "reset") {
          onResetSuccess();
        } else {
          onSuccess();
        }
      } catch (error) {
        console.error("Błąd podczas weryfikacji:", error);
        onError("Wystąpił błąd połączenia. Spróbuj ponownie.");
      }
    };

    handleVerification();
  }, [onSuccess, onResetSuccess, onError]);

  return null; // Komponent nie renderuje niczego wizualnie
}
