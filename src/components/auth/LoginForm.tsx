import React, { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

interface LoginFormValues {
  email: string;
  password: string;
}

// Schemat walidacji logowania
const loginSchema = z.object({
  email: z.string().email("Wprowadź poprawny adres email"),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
});

export default function LoginForm() {
  const [formValues, setFormValues] = useState<LoginFormValues>({
    email: "",
    password: "",
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
      loginSchema.parse(formValues);
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
      console.log("Logowanie użytkownika:", formValues.email);

      // Przekierowanie po pomyślnym logowaniu
      window.location.href = "/";
    } catch (error) {
      console.error("Błąd podczas logowania:", error);
      setErrors({
        form: "Nieprawidłowy email lub hasło. Spróbuj ponownie.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
      <h1 className="mb-6 text-2xl font-bold text-center">Logowanie</h1>

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
              Logowanie...
            </span>
          ) : (
            "Zaloguj się"
          )}
        </Button>

        <div className="space-y-3 text-center text-sm">
          <a href="/auth/reset-password" className="block text-primary hover:underline">
            Zapomniałem hasła
          </a>
          <p>
            Nie masz konta?{" "}
            <a href="/auth/register" className="text-primary hover:underline">
              Zarejestruj się
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
