import { useState, useEffect } from "react";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Hook do zarządzania autoryzacją
export function useAuth(): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  // Sprawdzenie sesji przy starcie
  useEffect(() => {
    const checkSession = async () => {
      try {
        // To będzie implementacja faktycznego sprawdzenia sesji z Supabase
        // const { data, error } = await supabase.auth.getSession();

        // Mockujemy dla potrzeb implementacji
        const mockUser = localStorage.getItem("auth_user");

        if (mockUser) {
          const user = JSON.parse(mockUser) as AuthUser;
          setState({
            user,
            isLoading: false,
            isAuthenticated: true,
            error: null,
          });
        } else {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            error: null,
          });
        }
      } catch (error) {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error: error instanceof Error ? error : new Error("Nieznany błąd autoryzacji"),
        });
      }
    };

    checkSession();
  }, []);

  // Logowanie
  const login = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // To będzie implementacja faktycznego logowania z Supabase
      // const { data, error } = await supabase.auth.signInWithPassword({
      //   email,
      //   password,
      // });

      // Mockujemy dla potrzeb implementacji
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockUser: AuthUser = {
        id: "123",
        email,
      };

      localStorage.setItem("auth_user", JSON.stringify(mockUser));

      setState({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Błąd podczas logowania"),
      }));
      throw error;
    }
  };

  // Rejestracja
  const register = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // To będzie implementacja faktycznej rejestracji z Supabase
      // const { data, error } = await supabase.auth.signUp({
      //   email,
      //   password,
      // });

      // Mockujemy dla potrzeb implementacji
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockUser: AuthUser = {
        id: "123",
        email,
      };

      localStorage.setItem("auth_user", JSON.stringify(mockUser));

      setState({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Błąd podczas rejestracji"),
      }));
      throw error;
    }
  };

  // Wylogowanie
  const logout = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // To będzie implementacja faktycznego wylogowania z Supabase
      // const { error } = await supabase.auth.signOut();

      // Mockujemy dla potrzeb implementacji
      await new Promise((resolve) => setTimeout(resolve, 500));

      localStorage.removeItem("auth_user");

      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Błąd podczas wylogowania"),
      }));
      throw error;
    }
  };

  return {
    ...state,
    login,
    register,
    logout,
  };
}
