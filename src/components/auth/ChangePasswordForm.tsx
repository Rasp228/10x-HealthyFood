import React, { useState, useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ChangePasswordFormValues {
  password: string;
  confirmPassword: string;
}

// Schemat walidacji dla ustawienia nowego hasła
const changePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Hasło musi mieć co najmniej 8 znaków")
      .regex(/\d/, "Hasło musi zawierać co najmniej jedną cyfrę")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Hasło musi zawierać co najmniej jeden znak specjalny"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

export default function ChangePasswordForm() {
  const { isLoading, error, clearError, exchangeCodeForSession, changePassword } = useAuth();
  const [formValues, setFormValues] = useState<ChangePasswordFormValues>({
    password: "",
    confirmPassword: "",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isCodeValid, setIsCodeValid] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sprawdź czy w URL jest code i wymień go na sesję
  useEffect(() => {
    const handleCodeExchange = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");

      if (!code) {
        setIsCodeValid(false);
        return;
      }

      try {
        const success = await exchangeCodeForSession(code);

        if (success) {
          setIsCodeValid(true);
          // Usuń code z URL żeby nie było problemów przy odświeżeniu
          const newUrl = window.location.pathname;
          window.history.replaceState({}, "", newUrl);
        } else {
          setIsCodeValid(false);
          if (error) {
            setAuthError(error.message);
          }
        }
      } catch (err) {
        console.error("Exception during code exchange:", err);
        setAuthError("Wystąpił błąd podczas przetwarzania linku");
        setIsCodeValid(false);
      }
    };

    handleCodeExchange();
  }, [exchangeCodeForSession, error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));

    // Usuwamy błędy walidacji i auth po zmianie wartości pola
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== name));
      });
    }
    if (error) {
      clearError();
    }
    if (authError) {
      setAuthError(null);
    }
  };

  const validateForm = (): boolean => {
    try {
      changePasswordSchema.parse(formValues);
      setValidationErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setValidationErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !formValues.password || !formValues.confirmPassword) {
      return;
    }

    const success = await changePassword(formValues.password, formValues.confirmPassword);

    if (success) {
      // Przekierowanie po pomyślnej zmianie hasła
      window.location.href = "/auth/login?message=password-updated";
    } else if (error) {
      setAuthError(error.message);
    }
  };

  // Jeśli nie ma kodu lub jest nieprawidłowy
  if (isCodeValid === false) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-red-600">Nieprawidłowy link</h1>
          <p className="mb-4 text-sm text-muted-foreground">Link do zmiany hasła jest nieprawidłowy lub wygasł.</p>
          {authError && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{authError}</div>
          )}
          <Button asChild>
            <a href="/auth/reset-password">Poproś o nowy link</a>
          </Button>
        </div>
      </div>
    );
  }

  // Ładowanie - sprawdzanie i wymiana kodu
  if (isCodeValid === null) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground">Aktywacja linku resetującego...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Ustaw nowe hasło</h1>

      {(error || authError) && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error?.message || authError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Nowe hasło
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formValues.password}
            onChange={handleChange}
            className={`w-full rounded-md border p-2 ${validationErrors.password ? "border-red-300" : "border-input"}`}
            placeholder="Wprowadź nowe hasło"
            required
          />
          {validationErrors.password && <p className="text-xs text-red-500">{validationErrors.password}</p>}
          <p className="text-xs text-muted-foreground">
            Hasło musi mieć co najmniej 8 znaków, zawierać cyfrę i znak specjalny
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Potwierdź nowe hasło
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formValues.confirmPassword}
            onChange={handleChange}
            className={`w-full rounded-md border p-2 ${validationErrors.confirmPassword ? "border-red-300" : "border-input"}`}
            placeholder="Potwierdź nowe hasło"
            required
          />
          {validationErrors.confirmPassword && (
            <p className="text-xs text-red-500">{validationErrors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Ustawianie nowego hasła...
            </span>
          ) : (
            "Ustaw nowe hasło"
          )}
        </Button>

        <div className="text-center text-sm">
          <a href="/auth/login" className="text-primary hover:underline">
            Powrót do logowania
          </a>
        </div>
      </form>
    </div>
  );
}
