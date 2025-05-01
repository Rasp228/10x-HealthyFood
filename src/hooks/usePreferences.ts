import { useState } from "react";
import type {
  PreferenceDto,
  CreatePreferenceCommand,
  UpdatePreferenceCommand,
  PaginatedPreferencesDto,
  PaginationParams,
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
  const fetchPreferences = async (params?: PaginationParams): Promise<PaginatedPreferencesDto | null> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Budujemy parametry URL
      const searchParams = new URLSearchParams();
      if (params?.limit) searchParams.append("limit", params.limit.toString());
      if (params?.offset) searchParams.append("offset", params.offset.toString());

      const queryString = searchParams.toString();
      const endpoint = `/api/preferences${queryString ? `?${queryString}` : ""}`;

      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Błąd pobierania preferencji: ${response.status}`);
      }

      const data = (await response.json()) as PaginatedPreferencesDto;

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
  };

  // Dodawanie nowej preferencji
  const createPreference = async (preference: CreatePreferenceCommand): Promise<PreferenceDto | null> => {
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
        throw new Error(`Błąd dodawania preferencji: ${response.status}`);
      }

      const newPreference = (await response.json()) as PreferenceDto;

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
  };

  // Aktualizacja istniejącej preferencji
  const updatePreference = async (id: number, preference: UpdatePreferenceCommand): Promise<PreferenceDto | null> => {
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
        throw new Error(`Błąd aktualizacji preferencji: ${response.status}`);
      }

      const updatedPreference = (await response.json()) as PreferenceDto;

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
  };

  // Usuwanie preferencji
  const deletePreference = async (id: number): Promise<boolean> => {
    setState((prev) => ({ ...prev, isDeleting: true, error: null }));

    try {
      const response = await fetch(`/api/preferences/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`Błąd usuwania preferencji: ${response.status}`);
      }

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
  };

  return {
    ...state,
    fetchPreferences,
    createPreference,
    updatePreference,
    deletePreference,
  };
}
