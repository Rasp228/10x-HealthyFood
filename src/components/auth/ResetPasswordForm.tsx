import React, { useState, useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

interface ResetPasswordFormValues {
  email?: string;
  password?: string;
  confirmPassword?: string;
  token?: string;
}

// Schemat walidacji dla żądania resetu
const requestResetSchema = z.object({
  email: z.string().email("Wprowadź poprawny adres email"),
});

// Schemat walidacji dla ustawienia nowego hasła
const setNewPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Hasło musi mieć co najmniej 8 znaków")
      .regex(/\d/, "Hasło musi zawierać co najmniej jedną cyfrę")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Hasło musi zawierać co najmniej jeden znak specjalny"),
    confirmPassword: z.string(),
    token: z.string().min(1, "Token resetowania jest wymagany"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

export default function ResetPasswordForm() {
  const [formValues, setFormValues] = useState<ResetPasswordFormValues>({
    email: "",
    password: "",
    confirmPassword: "",
    token: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isResetRequested, setIsResetRequested] = useState(false);
  const [step, setStep] = useState<"request" | "reset">("request");

  // Sprawdź czy w URL jest token (etap 2)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");
    if (token) {
      setStep("reset");
      setFormValues((prev) => ({ ...prev, token }));
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    // Usuwamy błąd po zmianie wartości pola
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        const { [name]: _, ...rest } = newErrors;
        return rest;
      });
    }
  };

  const validateRequestReset = (): boolean => {
    try {
      requestResetSchema.parse({ email: formValues.email });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const validateSetNewPassword = (): boolean => {
    try {
      setNewPasswordSchema.parse({
        password: formValues.password,
        confirmPassword: formValues.confirmPassword,
        token: formValues.token,
      });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateRequestReset()) return;

    setIsLoading(true);

    try {
      // Tutaj będzie logika integracji z Supabase Auth
      console.log("Żądanie resetu hasła dla:", formValues.email);

      setIsResetRequested(true);
    } catch (error) {
      console.error("Błąd podczas żądania resetu:", error);
      setErrors({
        form: "Wystąpił błąd podczas żądania resetu hasła. Spróbuj ponownie.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateSetNewPassword()) return;

    setIsLoading(true);

    try {
      // Tutaj będzie logika integracji z Supabase Auth
      console.log("Ustawienie nowego hasła z tokenem:", formValues.token);

      // Przekierowanie po pomyślnym ustawieniu hasła
      window.location.href = "/auth/login?message=password-updated";
    } catch (error) {
      console.error("Błąd podczas ustawiania nowego hasła:", error);
      setErrors({
        form: "Nieprawidłowy token lub błąd podczas ustawiania hasła. Spróbuj ponownie.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "request" && isResetRequested) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">Email wysłany</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Sprawdź swoją skrzynkę email. Wysłaliśmy Ci link do resetowania hasła.
          </p>
          <Button asChild>
            <a href="/auth/login">Powrót do logowania</a>
          </Button>
        </div>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="mb-6 text-2xl font-bold text-center">Ustaw nowe hasło</h1>

        {errors.form && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{errors.form}</div>
        )}

        <form onSubmit={handleSetNewPassword} className="space-y-4">
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
              className={`w-full rounded-md border p-2 ${errors.password ? "border-red-300" : "border-input"}`}
              required
            />
            {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
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
              className={`w-full rounded-md border p-2 ${errors.confirmPassword ? "border-red-300" : "border-input"}`}
              required
            />
            {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
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
                Ustawianie...
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

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Resetowanie hasła</h1>

      {errors.form && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{errors.form}</div>
      )}

      <form onSubmit={handleRequestReset} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formValues.email}
            onChange={handleChange}
            className={`w-full rounded-md border p-2 ${errors.email ? "border-red-300" : "border-input"}`}
            placeholder="twoj@email.com"
            required
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
          <p className="text-xs text-muted-foreground">Podaj adres email powiązany z Twoim kontem</p>
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
              Wysyłanie...
            </span>
          ) : (
            "Wyślij link resetujący"
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
