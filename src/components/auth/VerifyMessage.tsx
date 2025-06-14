import { useState, useEffect } from "react";

export function VerifyMessage() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    const success = urlParams.get("success");

    if (error) {
      setType("error");
      setMessage(decodeURIComponent(error));
    } else if (success) {
      setType("success");
      setMessage("Weryfikacja zakończona pomyślnie!");
    } else {
      setType("loading");
      setMessage("Przetwarzanie...");
    }
  }, []);

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      {/* Success State */}
      {type === "success" && (
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
          <p className="mb-6 text-sm text-muted-foreground">{message}</p>
          <a
            href="/auth/login"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Przejdź do logowania
          </a>
        </div>
      )}

      {/* Error State */}
      {type === "error" && (
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
          <p className="mb-6 text-sm text-muted-foreground">{message}</p>
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

      {/* Loading State */}
      {type === "loading" && (
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
          <h1 className="mb-4 text-2xl font-bold">Weryfikacja w toku...</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      )}
    </div>
  );
}
