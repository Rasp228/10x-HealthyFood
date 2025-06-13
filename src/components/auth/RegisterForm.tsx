import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useAuth } from "../../hooks/auth/useAuth";
import { registerSchema } from "../../lib/validations/auth/register";

interface RegisterFormValues {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterForm() {
  const [formValues, setFormValues] = useState<RegisterFormValues>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string>("");
  const { register, isLoading, error, clearError } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));

    // Usuwamy błąd walidacji po zmianie wartości pola
    if (validationErrors[name]) {
      setValidationErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== name)));
    }

    // Usuwamy błąd z API po zmianie wartości
    if (error) {
      clearError();
    }

    // Usuwamy komunikat sukcesu po zmianie wartości
    if (successMessage) {
      setSuccessMessage("");
    }
  };

  const validate = (): boolean => {
    try {
      registerSchema.parse(formValues);
      setValidationErrors({});
      return true;
    } catch (validationError: unknown) {
      if (validationError && typeof validationError === "object" && "errors" in validationError) {
        const zodError = validationError as { errors: { path: (string | number)[]; message: string }[] };
        const newErrors: Record<string, string> = {};
        zodError.errors.forEach((err) => {
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

    if (!validate()) return;

    const result = await register(formValues);

    if (result) {
      if (result.requiresVerification) {
        setSuccessMessage(result.message || "Sprawdź swoją skrzynkę pocztową i kliknij link weryfikacyjny.");
      } else {
        // Przekierowanie po pomyślnej rejestracji bez weryfikacji
        window.location.href = "/";
      }
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Rejestracja</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error.message}</div>
      )}

      {successMessage && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
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
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Hasło
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={formValues.password}
            onChange={handleChange}
            className={`w-full rounded-md border p-2 ${validationErrors.password ? "border-red-300" : "border-input"}`}
            required
          />
          {validationErrors.password && <p className="text-xs text-red-500">{validationErrors.password}</p>}
          <p className="text-xs text-muted-foreground">
            Hasło musi mieć co najmniej 8 znaków, zawierać cyfrę i znak specjalny
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Potwierdź hasło
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formValues.confirmPassword}
            onChange={handleChange}
            className={`w-full rounded-md border p-2 ${validationErrors.confirmPassword ? "border-red-300" : "border-input"}`}
            required
          />
          {validationErrors.confirmPassword && (
            <p className="text-xs text-red-500">{validationErrors.confirmPassword}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Rejestrowanie...
            </span>
          ) : (
            "Zarejestruj się"
          )}
        </Button>

        <div className="text-center text-sm">
          <p>
            Masz już konto?{" "}
            <a href="/auth/login" className="text-primary hover:underline">
              Zaloguj się
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
