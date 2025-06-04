import React, { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";

interface ResetPasswordFormValues {
  email: string;
}

// Schemat walidacji dla żądania resetu
const requestResetSchema = z.object({
  email: z.string().email("Wprowadź poprawny adres email"),
});

export default function ResetPasswordForm() {
  const { requestPasswordReset, isLoading, error, clearError } = useAuth();
  const [formValues, setFormValues] = useState<ResetPasswordFormValues>({
    email: "",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isResetRequested, setIsResetRequested] = useState(false);

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
  };

  const validateRequestReset = (): boolean => {
    try {
      requestResetSchema.parse({ email: formValues.email });
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

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateRequestReset()) return;

    const success = await requestPasswordReset(formValues.email);
    if (success) {
      setIsResetRequested(true);
    }
  };

  if (isResetRequested) {
    return (
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold">Email wysłany</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Sprawdź swoją skrzynkę email. Wysłaliśmy Ci link do zmiany hasła.
          </p>
          <Button asChild>
            <a href="/auth/login">Powrót do logowania</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Resetowanie hasła</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error.message}</div>
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
            className={`w-full rounded-md border p-2 ${validationErrors.email ? "border-red-300" : "border-input"}`}
            placeholder="twoj@email.com"
            required
          />
          {validationErrors.email && <p className="text-xs text-red-500">{validationErrors.email}</p>}
          <p className="text-xs text-muted-foreground">Podaj adres email powiązany z Twoim kontem</p>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
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
