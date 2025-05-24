import React, { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

interface RegisterFormValues {
  email: string;
  password: string;
  confirmPassword: string;
}

// Schemat walidacji rejestracji
const registerSchema = z
  .object({
    email: z.string().email("Wprowadź poprawny adres email"),
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

export default function RegisterForm() {
  const [formValues, setFormValues] = useState<RegisterFormValues>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
    // Usuwamy błąd po zmianie wartości pola
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        newErrors[name] = undefined;
        return Object.fromEntries(Object.entries(newErrors).filter(([, value]) => value !== undefined));
      });
    }
  };

  const validate = (): boolean => {
    try {
      registerSchema.parse(formValues);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsLoading(true);

    try {
      // Tutaj będzie logika integracji z Supabase Auth
      console.log("Rejestracja użytkownika:", formValues.email);

      // Przekierowanie po pomyślnej rejestracji
      window.location.href = "/auth/login?message=check-email";
    } catch (error) {
      console.error("Błąd podczas rejestracji:", error);
      setErrors({
        form: "Wystąpił błąd podczas rejestracji. Spróbuj ponownie.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Rejestracja</h1>

      {errors.form && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{errors.form}</div>
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
            className={`w-full rounded-md border p-2 ${errors.email ? "border-red-300" : "border-input"}`}
            placeholder="twoj@email.com"
            required
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
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
            Potwierdź hasło
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
              Rejestracja...
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
