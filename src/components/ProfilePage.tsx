import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import PreferenceChip from "./PreferenceChip";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { z } from "zod";
import type { PreferenceDto, CreatePreferenceCommand, UpdatePreferenceCommand } from "../types";

// Schemat walidacji dla nowej preferencji
const preferenceSchema = z.object({
  category: z.string().min(1, "Kategoria jest wymagana"),
  value: z.string().min(1, "Wartość jest wymagana").max(50, "Wartość nie może przekraczać 50 znaków"),
});

// Mock dla danych preferencji
const mockPreferences: PreferenceDto[] = [
  {
    id: 1,
    category: "diet",
    value: "Wegetariańska",
    user_id: "123",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 2,
    category: "allergy",
    value: "Orzechy",
    user_id: "123",
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
  },
  {
    id: 3,
    category: "dislike",
    value: "Brokuły",
    user_id: "123",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
  },
  {
    id: 4,
    category: "like",
    value: "Truskawki",
    user_id: "123",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 5,
    category: "excluded",
    value: "Gluten",
    user_id: "123",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
];

// Hook do zarządzania preferencjami użytkownika (mockowane dane)
function useMockPreferences() {
  const [preferences, setPreferences] = useState<PreferenceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Pobieranie preferencji (mockowane)
  const fetchPreferences = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 800));
      setPreferences(mockPreferences);
      return { data: mockPreferences, total: mockPreferences.length, limit: 50, offset: 0 };
    } catch (err) {
      const thrownError = err instanceof Error ? err : new Error("Nieznany błąd podczas pobierania preferencji");
      setError(thrownError);
      throw thrownError;
    } finally {
      setIsLoading(false);
    }
  };

  // Dodawanie nowej preferencji (mockowane)
  const createPreference = async (preference: CreatePreferenceCommand): Promise<PreferenceDto> => {
    setIsCreating(true);
    setError(null);

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Generowanie nowej preferencji
      const newPreference: PreferenceDto = {
        id: Math.max(0, ...preferences.map((p) => p.id)) + 1,
        category: preference.category,
        value: preference.value,
        user_id: "123",
        created_at: new Date().toISOString(),
      };

      setPreferences((prev) => [...prev, newPreference]);
      return newPreference;
    } catch (err) {
      const thrownError = err instanceof Error ? err : new Error("Nieznany błąd podczas dodawania preferencji");
      setError(thrownError);
      throw thrownError;
    } finally {
      setIsCreating(false);
    }
  };

  // Aktualizacja istniejącej preferencji (mockowane)
  const updatePreference = async (id: number, preference: UpdatePreferenceCommand): Promise<PreferenceDto> => {
    setIsUpdating(true);
    setError(null);

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Znalezienie i aktualizacja preferencji
      const existingPref = preferences.find((p) => p.id === id);
      if (!existingPref) {
        throw new Error("Nie znaleziono preferencji o podanym ID");
      }

      const updatedPreference: PreferenceDto = {
        ...existingPref,
        category: preference.category,
        value: preference.value,
      };

      setPreferences((prev) => prev.map((p) => (p.id === id ? updatedPreference : p)));
      return updatedPreference;
    } catch (err) {
      const thrownError = err instanceof Error ? err : new Error("Nieznany błąd podczas aktualizacji preferencji");
      setError(thrownError);
      throw thrownError;
    } finally {
      setIsUpdating(false);
    }
  };

  // Usuwanie preferencji (mockowane)
  const deletePreference = async (id: number): Promise<boolean> => {
    setIsDeleting(true);
    setError(null);

    try {
      // Symulacja opóźnienia sieci
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Sprawdzenie czy preferencja istnieje
      const existsIndex = preferences.findIndex((p) => p.id === id);
      if (existsIndex === -1) {
        throw new Error("Nie znaleziono preferencji o podanym ID");
      }

      // Aktualizacja stanu
      setPreferences((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      const thrownError = err instanceof Error ? err : new Error("Nieznany błąd podczas usuwania preferencji");
      setError(thrownError);
      throw thrownError;
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    preferences,
    total: preferences.length,
    isLoading,
    isCreating,
    isUpdating,
    isDeleting,
    error,
    fetchPreferences,
    createPreference,
    updatePreference,
    deletePreference,
  };
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    preferences,
    total,
    isLoading,
    isCreating,
    error,
    fetchPreferences,
    createPreference,
    updatePreference,
    deletePreference,
  } = useMockPreferences();

  const [newPreference, setNewPreference] = useState<CreatePreferenceCommand>({ category: "diet", value: "" });
  const [formError, setFormError] = useState("");
  const [stats, setStats] = useState({ totalRecipes: 0, aiGenerated: 0 });

  // Pobieranie preferencji przy montowaniu komponentu
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        await fetchPreferences();
      } catch (err) {
        showToast("Błąd podczas ładowania preferencji", "error");
      }
    };

    loadPreferences();
  }, [fetchPreferences, showToast]);

  // Pobieranie statystyk (mockowane)
  useEffect(() => {
    // Mockowane dane statystyk
    setStats({
      totalRecipes: 12,
      aiGenerated: 4,
    });
  }, []);

  // Grupowanie preferencji według kategorii
  const preferencesByCategory = preferences.reduce<Record<string, PreferenceDto[]>>((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = [];
    }
    acc[pref.category].push(pref);
    return acc;
  }, {});

  // Mapowanie kategorii na etykiety dla UI
  const categoryLabels: Record<string, string> = {
    diet: "Diety",
    allergy: "Alergie",
    like: "Produkty lubiane",
    dislike: "Produkty nielubiane",
    excluded: "Produkty wykluczone",
    other: "Inne",
  };

  // Obsługa dodawania nowej preferencji
  const handleAddPreference = async () => {
    setFormError("");

    try {
      // Walidacja za pomocą Zod
      preferenceSchema.parse(newPreference);

      if (total >= 50) {
        throw new Error("Osiągnięto maksymalną liczbę preferencji (50)");
      }

      await createPreference(newPreference);
      setNewPreference({ ...newPreference, value: "" });
      showToast("Preferencja została dodana", "success");
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map((e) => e.message);
        setFormError(errors[0]);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Wystąpił błąd podczas dodawania preferencji");
      }
    }
  };

  // Obsługa aktualizacji preferencji
  const handleUpdatePreference = async (id: number, value: string) => {
    try {
      const updateData: UpdatePreferenceCommand = {
        category: preferences.find((p) => p.id === id)?.category || "other",
        value,
      };

      await updatePreference(id, updateData);
      showToast("Preferencja została zaktualizowana", "success");
    } catch (err) {
      showToast("Błąd podczas aktualizacji preferencji", "error");
      throw err;
    }
  };

  // Obsługa usuwania preferencji
  const handleDeletePreference = async (id: number) => {
    try {
      await deletePreference(id);
      showToast("Preferencja została usunięta", "success");
    } catch (err) {
      showToast("Błąd podczas usuwania preferencji", "error");
      throw err;
    }
  };

  // Formatowanie daty
  const formatDate = (dateString: string) => {
    try {
      const options: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      return new Date(dateString).toLocaleDateString("pl", options);
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Profil użytkownika</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Informacje o użytkowniku */}
        <div className="bg-card rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Informacje</h2>
          <div className="space-y-2">
            <div>
              <span className="text-muted-foreground">Email:</span>
              <span className="ml-2 font-medium">{user?.email || "Niezalogowany"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Data utworzenia konta:</span>
              <span className="ml-2">{user?.created_at ? formatDate(user.created_at) : "N/A"}</span>
            </div>
            <div className="pt-2">
              <span className="text-muted-foreground">Statystyki:</span>
              <ul className="mt-1 ml-4 list-disc text-sm">
                <li>
                  <span className="text-muted-foreground">Liczba przepisów:</span>{" "}
                  <span className="font-medium">{stats.totalRecipes}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">Wygenerowane przez AI:</span>{" "}
                  <span className="font-medium">{stats.aiGenerated}</span>
                </li>
                <li>
                  <span className="text-muted-foreground">Preferencje:</span>{" "}
                  <span className="font-medium">{total}</span>
                  <span className="text-muted-foreground text-xs ml-1">(max. 50)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Formularz dodawania preferencji */}
        <div className="bg-card rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Dodaj preferencję</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="category" className="block text-sm font-medium mb-1">
                Kategoria
              </label>
              <select
                id="category"
                value={newPreference.category}
                onChange={(e) => setNewPreference({ ...newPreference, category: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isCreating}
              >
                <option value="diet">Dieta</option>
                <option value="allergy">Alergia</option>
                <option value="like">Lubię</option>
                <option value="dislike">Nie lubię</option>
                <option value="excluded">Wykluczony produkt</option>
                <option value="other">Inne</option>
              </select>
            </div>
            <div>
              <label htmlFor="value" className="block text-sm font-medium mb-1">
                Wartość
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="value"
                  value={newPreference.value}
                  onChange={(e) => setNewPreference({ ...newPreference, value: e.target.value })}
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="np. Wegetariańska"
                  maxLength={50}
                  disabled={isCreating}
                />
                <Button onClick={handleAddPreference} disabled={isCreating || total >= 50}>
                  {isCreating ? "Dodawanie..." : "Dodaj"}
                </Button>
              </div>
              {formError && <p className="text-red-500 text-xs mt-1">{formError}</p>}
              {total >= 50 && (
                <p className="text-amber-500 text-xs mt-1">
                  Osiągnięto maksymalną liczbę preferencji. Usuń niektóre, aby dodać nowe.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lista preferencji */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Twoje preferencje</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4 dark:bg-red-950 dark:text-red-400">
            {error.message}
          </div>
        )}

        {isLoading && !preferences.length ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-muted-foreground">Ładowanie preferencji...</p>
          </div>
        ) : !preferences.length ? (
          <div className="text-center py-8 bg-muted/50 rounded-lg">
            <p className="text-muted-foreground">Nie dodano jeszcze żadnych preferencji</p>
            <p className="text-sm mt-1">
              Dodaj swoje preferencje powyżej, aby AI mogło generować lepiej dopasowane przepisy
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(preferencesByCategory).map(([category, preferences]) => (
              <div key={category} className="bg-card rounded-lg p-4 shadow-sm">
                <h3 className="font-medium text-lg mb-3">{categoryLabels[category] || category}</h3>
                <div className="space-y-1">
                  {preferences.map((pref) => (
                    <PreferenceChip
                      key={pref.id}
                      preference={pref}
                      onUpdate={handleUpdatePreference}
                      onDelete={handleDeletePreference}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
