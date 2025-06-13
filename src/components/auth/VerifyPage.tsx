import { useState } from "react";
import { VerifyHandler } from "./VerifyHandler";

type VerifyState = "loading" | "success" | "reset-success" | "error";

export function VerifyPage() {
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSuccess = () => setState("success");
  const handleResetSuccess = () => setState("reset-success");
  const handleError = (message: string) => {
    setErrorMessage(message);
    setState("error");
  };

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <VerifyHandler onSuccess={handleSuccess} onResetSuccess={handleResetSuccess} onError={handleError} />

      {/* Loading State */}
      {state === "loading" && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
          <h1 className="mb-4 text-2xl font-bold">Weryfikacja w toku...</h1>
          <p className="text-sm text-muted-foreground">Przetwarzamy Twój link weryfikacyjny</p>
        </div>
      )}

      {/* Success State */}
      {state === "success" && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <svg className="h-16 w-16 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-green-700">Weryfikacja zakończona!</h1>
          <p className="mb-6 text-sm text-muted-foreground">Twój adres email został pomyślnie zweryfikowany!</p>
          <a
            href="/auth/login"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Przejdź do logowania
          </a>
        </div>
      )}

      {/* Reset Success State */}
      {state === "reset-success" && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <svg className="h-16 w-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 7a2 2 0 712 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-3a1 1 0 011-1h2.586l6.414-6.414z"
              ></path>
            </svg>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-blue-700">Link aktywowany!</h1>
          <p className="mb-6 text-sm text-muted-foreground">Możesz teraz ustawić nowe hasło</p>
          <a
            href="/auth/change-password"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Ustaw nowe hasło
          </a>
        </div>
      )}

      {/* Error State */}
      {state === "error" && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <svg className="h-16 w-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              ></path>
            </svg>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-red-700">Błąd weryfikacji</h1>
          <p className="mb-6 text-sm text-muted-foreground">{errorMessage}</p>
          <div className="space-y-2">
            <a
              href="/auth/reset-password"
              className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Poproś o nowy link
            </a>
            <a
              href="/auth/login"
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Powrót do logowania
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
