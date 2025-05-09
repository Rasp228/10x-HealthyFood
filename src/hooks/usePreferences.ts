import { useState, useCallback } from "react";
import type {
  PreferenceDto,
  CreatePreferenceCommand,
  UpdatePreferenceCommand,
  PaginatedPreferencesDto,
  PaginationParams,
  PreferenceCategoryEnum,
} from "../types";

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
  fetchPreferences: (params?: PaginationParams) => Promise<PaginatedPreferencesDto | null>;
  createPreference: (preference: CreatePreferenceCommand) => Promise<PreferenceDto | null>;
  updatePreference: (id: number, preference: UpdatePreferenceCommand) => Promise<PreferenceDto | null>;
  deletePreference: (id: number) => Promise<boolean>;
}

// Mockowane dane preferencji
const mockPreferences: PreferenceDto[] = [
  {
    id: 1,
    category: "diety" as PreferenceCategoryEnum,
    value: "Wegetariańska",
    user_id: "123",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 2,
    category: "wykluczone" as PreferenceCategoryEnum,
    value: "Orzechy",
    user_id: "123",
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 3,
    category: "nielubiane" as PreferenceCategoryEnum,
    value: "Brokuły",
    user_id: "123",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 4,
    category: "lubiane" as PreferenceCategoryEnum,
    value: "Truskawki",
    user_id: "123",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 5,
    category: "wykluczone" as PreferenceCategoryEnum,
    value: "Gluten",
    user_id: "123",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

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

  // Pobieranie preferencji (mockowane)
  const fetchPreferences = useCallback(async (params?: PaginationParams): Promise<PaginatedPreferencesDto | null> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Budujemy parametry filtrowania
      const limit = params?.limit || 50;
      const offset = params?.offset || 0;

      // Symulacja paginacji
      const paginatedPreferences = mockPreferences.slice(offset, offset + limit);

      const data: PaginatedPreferencesDto = {
        data: paginatedPreferences,
        total: mockPreferences.length,
        limit,
        offset,
      };

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

  // Dodawanie nowej preferencji (mockowane)
  const createPreference = useCallback(async (preference: CreatePreferenceCommand): Promise<PreferenceDto | null> => {
    setState((prev) => ({ ...prev, isCreating: true, error: null }));

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Tworzenie nowego ID (w prawdziwym API byłoby przydzielane przez serwer)
      const newId = Math.max(0, ...mockPreferences.map((p) => p.id)) + 1;

      // Tworzenie nowej preferencji
      const newPreference: PreferenceDto = {
        id: newId,
        category: preference.category as PreferenceCategoryEnum,
        value: preference.value,
        user_id: "123", // ID zalogowanego użytkownika (mockowane)
        created_at: new Date().toISOString(),
      };

      // Dodajemy do mockowanej listy - normalnie zrobiłby to serwer
      mockPreferences.push(newPreference);

      // Aktualizujemy stan dodając nową preferencję
      setState((prev) => ({
        ...prev,
        preferences: [...prev.preferences, newPreference],
        total: prev.total + 1,
        isCreating: false,
      }));

      return newPreference;
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

  // Aktualizacja istniejącej preferencji (mockowane)
  const updatePreference = useCallback(async (id: number, preference: UpdatePreferenceCommand): Promise<PreferenceDto | null> => {
    setState((prev) => ({ ...prev, isUpdating: true, error: null }));

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Znajdź preferencję do aktualizacji
      const preferenceIndex = mockPreferences.findIndex((p) => p.id === id);
      if (preferenceIndex === -1) {
        throw new Error(`Nie znaleziono preferencji o ID: ${id}`);
      }

      // Aktualizuj preferencję w mockowanej liście
      const updatedPreference: PreferenceDto = {
        ...mockPreferences[preferenceIndex],
        category: preference.category as PreferenceCategoryEnum,
        value: preference.value,
      };

      mockPreferences[preferenceIndex] = updatedPreference;

      // Aktualizujemy stan zastępując zaktualizowaną preferencję
      setState((prev) => ({
        ...prev,
        preferences: prev.preferences.map((p) => (p.id === id ? updatedPreference : p)),
        isUpdating: false,
      }));

      return updatedPreference;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas aktualizacji preferencji");
      setState((prev) => ({
        ...prev,
        isUpdating: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  }, []);

  // Usuwanie preferencji (mockowane)
  const deletePreference = useCallback(async (id: number): Promise<boolean> => {
    setState((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Znajdź preferencję do usunięcia
      const preferenceIndex = mockPreferences.findIndex((p) => p.id === id);
      if (preferenceIndex === -1) {
        throw new Error(`Nie znaleziono preferencji o ID: ${id}`);
      }

      // Usuń preferencję z mockowanej listy
      mockPreferences.splice(preferenceIndex, 1);

      // Aktualizujemy stan usuwając preferencję
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
