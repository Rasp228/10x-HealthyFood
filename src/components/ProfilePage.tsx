import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import PreferenceChip from "./PreferenceChip";
import { useAuth } from "../hooks/useAuth";
import type { PreferenceDto } from "../types";

// Mock dla PreferenceDto z różnymi kategoriami
type MockPreference = PreferenceDto & {
  id: number;
  category: string;
  value: string;
  user_id: string;
  created_at: string;
};

// Hook do zarządzania preferencjami użytkownika
function usePreferences() {
  const [preferences, setPreferences] = useState<MockPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Pobieranie preferencji
  const fetchPreferences = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch("/api/preferences");
      // const data = await response.json();

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Przykładowe preferencje
      const mockPreferences: MockPreference[] = [
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

      setPreferences(mockPreferences);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Nieznany błąd podczas pobierania preferencji"));
      console.error("Błąd podczas pobierania preferencji:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Dodawanie preferencji
  const addPreference = async (category: string, value: string) => {
    if (preferences.length >= 50) {
      throw new Error("Osiągnięto maksymalną liczbę preferencji (50)");
    }

    if (value.length > 50) {
      throw new Error("Wartość preferencji nie może przekraczać 50 znaków");
    }

    setIsLoading(true);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch("/api/preferences", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ category, value })
      // });
      // const data = await response.json();

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 500));

      const newPreference: MockPreference = {
        id: Math.floor(Math.random() * 1000) + 100,
        category,
        value,
        user_id: "123",
        created_at: new Date().toISOString(),
      };

      setPreferences((prev) => [...prev, newPreference]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Nieznany błąd podczas dodawania preferencji"));
      console.error("Błąd podczas dodawania preferencji:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Aktualizacja preferencji
  const updatePreference = async (id: number, newValue: string) => {
    if (newValue.length > 50) {
      throw new Error("Wartość preferencji nie może przekraczać 50 znaków");
    }

    setIsLoading(true);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch(`/api/preferences/${id}`, {
      //   method: "PUT",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ value: newValue })
      // });
      // const data = await response.json();

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 500));

      setPreferences((prev) => prev.map((pref) => (pref.id === id ? { ...pref, value: newValue } : pref)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Nieznany błąd podczas aktualizacji preferencji"));
      console.error("Błąd podczas aktualizacji preferencji:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Usuwanie preferencji
  const deletePreference = async (id: number) => {
    setIsLoading(true);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch(`/api/preferences/${id}`, {
      //   method: "DELETE"
      // });

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 400));

      setPreferences((prev) => prev.filter((pref) => pref.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Nieznany błąd podczas usuwania preferencji"));
      console.error("Błąd podczas usuwania preferencji:", err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Pobieramy preferencje przy montowaniu komponentu
  useEffect(() => {
    fetchPreferences();
  }, []);

  return {
    preferences,
    isLoading,
    error,
    addPreference,
    updatePreference,
    deletePreference,
  };
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { preferences, isLoading, error, addPreference, updatePreference, deletePreference } = usePreferences();

  const [newPreference, setNewPreference] = useState({ category: "diet", value: "" });
  const [formError, setFormError] = useState("");
  const [stats, setStats] = useState({ totalRecipes: 0, aiGenerated: 0 });

  // Pobieranie statystyk (mockowane)
  useEffect(() => {
    // W rzeczywistej implementacji pobieralibyśmy z API
    setStats({
      totalRecipes: 12,
      aiGenerated: 4,
    });
  }, []);

  // Grupowanie preferencji według kategorii
  const preferencesByCategory = preferences.reduce<Record<string, MockPreference[]>>((acc, pref) => {
    if (!acc[pref.category]) {
      acc[pref.category] = [];
    }
    acc[pref.category].push(pref);
    return acc;
  }, {});

  // Mapowanie kategorii na etykiety dla UI - NOWE KATEGORIE
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
    if (!newPreference.value.trim()) {
      setFormError("Wartość preferencji nie może być pusta");
      return;
    }

    try {
      await addPreference(newPreference.category, newPreference.value.trim());
      setNewPreference({ ...newPreference, value: "" });
    } catch (err) {
      if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError("Wystąpił błąd podczas dodawania preferencji");
      }
    }
  };

  // Formatowanie daty
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  return (
    <div className="space-y-8">
      {/* Profil użytkownika */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-6 text-xl font-bold">Profil użytkownika</h2>

        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Adres email</div>
            <div>{user?.email || "przykład@mail.com"}</div>
          </div>

          <div>
            <div className="text-sm font-medium text-muted-foreground">Data dołączenia</div>
            <div>{formatDate(user?.created_at || new Date(Date.now() - 180 * 86400000).toISOString())}</div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold">{stats.totalRecipes}</div>
              <div className="text-sm text-muted-foreground">Łącznie przepisów</div>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-2xl font-bold">{stats.aiGenerated}</div>
              <div className="text-sm text-muted-foreground">Wygenerowanych przez AI</div>
            </div>
          </div>
        </div>
      </div>

      {/* Preferencje kulinarne */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="mb-6 text-xl font-bold">Preferencje kulinarne</h2>

        {/* Formularz dodawania preferencji */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={newPreference.category}
              onChange={(e) => setNewPreference({ ...newPreference, category: e.target.value })}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(categoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={newPreference.value}
              onChange={(e) => setNewPreference({ ...newPreference, value: e.target.value })}
              placeholder="Nowa preferencja (np. Wegetariańska, Bez glutenu)"
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={50}
            />

            <Button onClick={handleAddPreference} disabled={isLoading}>
              Dodaj
            </Button>
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}

          <p className="text-xs text-muted-foreground">
            Możesz dodać maksymalnie 50 preferencji. Każda wartość może mieć maksymalnie 50 znaków.
          </p>
        </div>

        {isLoading && preferences.length === 0 ? (
          <div className="flex h-20 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error.message}</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(preferencesByCategory).length > 0 ? (
              Object.entries(preferencesByCategory).map(([category, prefs]) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-md font-medium">{categoryLabels[category] || category}</h3>
                  <div className="flex flex-wrap gap-2">
                    {prefs.map((pref) => (
                      <PreferenceChip
                        key={pref.id}
                        preference={pref}
                        onUpdate={(value) => updatePreference(pref.id, value)}
                        onDelete={() => deletePreference(pref.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border-2 border-dashed border-muted p-6 text-center">
                <h3 className="mb-2 text-lg font-medium">Brak preferencji</h3>
                <p className="text-sm text-muted-foreground">
                  Dodaj swoje preferencje kulinarne, aby uzyskać lepsze rekomendacje przepisów.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
