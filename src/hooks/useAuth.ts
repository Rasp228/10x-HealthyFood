import { useState, useEffect } from "react";
import type { LoginSchema } from "../lib/validations/auth/login.ts";
import type { RegisterSchema } from "../lib/validations/auth/register.ts";

interface AuthError {
  message: string;
  details?: unknown[];
}

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

interface AuthResponse {
  message?: string;
  user?: AuthUser;
  requiresVerification?: boolean;
}

export const useAuth = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error("Błąd podczas pobierania danych użytkownika:", error);
      }
    };

    fetchUser();
  }, []);

  const clearError = () => setError(null);

  const login = async (credentials: LoginSchema): Promise<AuthResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Wystąpił błąd podczas logowania",
          details: data.details,
        });
        return null;
      }

      // Przekierowanie po pomyślnym logowaniu
      window.location.href = "/";
      return data;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegisterSchema): Promise<AuthResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Wystąpił błąd podczas rejestracji",
          details: data.details,
        });
        return null;
      }

      return data;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        setError({
          message: data.error || "Wystąpił błąd podczas wylogowania",
        });
        return false;
      }

      // Przekierowanie po pomyślnym wylogowaniu
      window.location.href = "/auth/login";
      return true;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Wystąpił błąd podczas wysyłania linku resetującego",
          details: data.details,
        });
        return false;
      }

      return true;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePassword = async (token: string, password: string, confirmPassword: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Wystąpił błąd podczas ustawiania nowego hasła",
          details: data.details,
        });
        return false;
      }

      return true;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const exchangeCodeForSession = async (code: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

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
        setError({
          message: data.error || "Wystąpił błąd podczas aktywacji linku",
          details: data.details,
        });
        return false;
      }

      return true;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (password: string, confirmPassword: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({
          message: data.error || "Wystąpił błąd podczas zmiany hasła",
          details: data.details,
        });
        return false;
      }

      return true;
    } catch {
      setError({
        message: "Wystąpił błąd połączenia. Spróbuj ponownie.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    user,
    clearError,
    login,
    register,
    logout,
    requestPasswordReset,
    updatePassword,
    exchangeCodeForSession,
    changePassword,
  };
};
