import { useState, useCallback } from "react";
import type { PreferenceDto, CreatePreferenceCommand, UpdatePreferenceCommand, PreferencesDto } from "../../types";

interface UsePreferencesState {
  preferences: PreferenceDto[];
  total: number;
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  error: Error | null;
}

interface UsePreferencesActions {
  fetchPreferences: () => Promise<PreferencesDto | null>;
  createPreference: (preference: CreatePreferenceCommand) => Promise<PreferenceDto | null>;
  updatePreference: (id: number, preference: UpdatePreferenceCommand) => Promise<PreferenceDto | null>;
  deletePreference: (id: number) => Promise<boolean>;
}

export function usePreferences(): UsePreferencesState & UsePreferencesActions {
  const [state, setState] = useState<UsePreferencesState>({
    preferences: [],
    total: 0,
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
    error: null,
  });

  // Pobieranie preferencji
  const fetchPreferences = useCallback(async (): Promise<PreferencesDto | null> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const queryParams = new URLSearchParams();

      const response = await fetch(`/api/preferences?${queryParams.toString()}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Błąd podczas pobierania preferencji");
      }

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        preferences: data.data,
        total: data.total,
        isLoading: false,
      }));

      return data;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas pobierania preferencji");
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  }, []);

  // Dodawanie nowej preferencji
  const createPreference = useCallback(async (preference: CreatePreferenceCommand): Promise<PreferenceDto | null> => {
    setState((prev) => ({ ...prev, isCreating: true, error: null }));

    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preference),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Błąd podczas dodawania preferencji");
      }

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        preferences: [...prev.preferences, data],
        total: prev.total + 1,
        isCreating: false,
      }));

      return data;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas dodawania preferencji");
      setState((prev) => ({
        ...prev,
        isCreating: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  }, []);

  // Aktualizacja istniejącej preferencji
  const updatePreference = useCallback(
    async (id: number, preference: UpdatePreferenceCommand): Promise<PreferenceDto | null> => {
      setState((prev) => ({ ...prev, isUpdating: true, error: null }));

      try {
        const response = await fetch(`/api/preferences/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(preference),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Błąd podczas aktualizacji preferencji");
        }

        const data = await response.json();
        setState((prev) => ({
          ...prev,
          preferences: prev.preferences.map((p) => (p.id === id ? data : p)),
          isUpdating: false,
        }));

        return data;
      } catch (error) {
        const thrownError =
          error instanceof Error ? error : new Error("Nieznany błąd podczas aktualizacji preferencji");
        setState((prev) => ({
          ...prev,
          isUpdating: false,
          error: thrownError,
        }));

        throw thrownError;
      }
    },
    []
  );

  // Usuwanie preferencji
  const deletePreference = useCallback(async (id: number): Promise<boolean> => {
    setState((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const response = await fetch(`/api/preferences/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Błąd podczas usuwania preferencji");
      }

      setState((prev) => ({
        ...prev,
        preferences: prev.preferences.filter((p) => p.id !== id),
        total: prev.total - 1,
        isDeleting: false,
      }));

      return true;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas usuwania preferencji");
      setState((prev) => ({
        ...prev,
        isDeleting: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  }, []);

  return {
    ...state,
    fetchPreferences,
    createPreference,
    updatePreference,
    deletePreference,
  };
}
