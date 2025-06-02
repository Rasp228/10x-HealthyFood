import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import PreferenceChip from "./PreferenceChip";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { usePreferences } from "../hooks/usePreferences";
import { useUserStats } from "../hooks/useUserStats";
import { z } from "zod";
import type { PreferenceDto, CreatePreferenceCommand, UpdatePreferenceCommand, PreferenceCategoryEnum } from "../types";

// Schemat walidacji dla nowej preferencji
const preferenceSchema = z.object({
  category: z.string().min(1, "Kategoria jest wymagana"),
  value: z.string().min(1, "Wartość jest wymagana").max(50, "Wartość nie może przekraczać 50 znaków"),
});

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
  } = usePreferences();

  // Używamy hooka do pobierania statystyk zamiast state
  const { stats, isLoading: isStatsLoading, error: statsError, refetch: refetchStats } = useUserStats();

  const [newPreference, setNewPreference] = useState<CreatePreferenceCommand>({
    category: "diety" as PreferenceCategoryEnum,
    value: "",
  });
  const [formError, setFormError] = useState("");

  // Pobieranie preferencji przy montowaniu komponentu
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        await fetchPreferences();
      } catch {
        showToast("Błąd podczas ładowania preferencji", "error");
      }
    };

    loadPreferences();
  }, [fetchPreferences, showToast]);

  // Obsługa błędów statystyk
  useEffect(() => {
    if (statsError) {
      showToast("Błąd podczas ładowania statystyk", "error");
    }
  }, [statsError, showToast]);

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
    diety: "Diety",
    lubiane: "Produkty lubiane",
    nielubiane: "Produkty nielubiane",
    wykluczone: "Produkty wykluczone",
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
      const preference = preferences.find((p) => p.id === id);
      if (!preference) {
        throw new Error("Nie znaleziono preferencji o podanym ID");
      }

      const updateData: UpdatePreferenceCommand = {
        category: preference.category as PreferenceCategoryEnum,
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
    } catch {
      return dateString;
    }
  };

  // Renderowanie daty utworzenia konta
  const renderAccountCreationDate = () => {
    if (!user) return "N/A";
    return formatDate(user.created_at);
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
              <span className="ml-2">{renderAccountCreationDate()}</span>
            </div>
            <div className="pt-2">
              <span className="text-muted-foreground">Statystyki:</span>
              {isStatsLoading ? (
                <div className="mt-1 ml-4">
                  <div className="animate-pulse">
                    <div className="h-4 bg-muted rounded w-32 mb-1"></div>
                    <div className="h-4 bg-muted rounded w-28 mb-1"></div>
                    <div className="h-4 bg-muted rounded w-24"></div>
                  </div>
                </div>
              ) : statsError ? (
                <div className="mt-1 ml-4 text-red-500 text-sm">
                  Błąd ładowania statystyk{" "}
                  <button onClick={refetchStats} className="underline hover:no-underline">
                    Spróbuj ponownie
                  </button>
                </div>
              ) : (
                <ul className="mt-1 ml-4 list-disc text-sm" aria-label="Statystyki użytkownika">
                  <li>
                    <span className="text-muted-foreground">Liczba przepisów:</span>{" "}
                    <span className="font-medium">{stats?.totalRecipes || 0}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Wygenerowane przez AI:</span>{" "}
                    <span className="font-medium">{stats?.aiGeneratedRecipes || 0}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Preferencje:</span>{" "}
                    <span className="font-medium">{total}</span>
                    <span className="text-muted-foreground text-xs ml-1">(max. 50)</span>
                  </li>
                  {stats?.lastRecipeDate && (
                    <li>
                      <span className="text-muted-foreground">Ostatni przepis:</span>{" "}
                      <span className="font-medium">{formatDate(stats.lastRecipeDate)}</span>
                    </li>
                  )}
                </ul>
              )}
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
                onChange={(e) =>
                  setNewPreference({
                    ...newPreference,
                    category: e.target.value as PreferenceCategoryEnum,
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isCreating}
                aria-label="Wybierz kategorię preferencji"
                aria-invalid={false}
              >
                <option value="diety">Dieta</option>
                <option value="lubiane">Lubię</option>
                <option value="nielubiane">Nie lubię</option>
                <option value="wykluczone">Wykluczony produkt</option>
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
                  aria-label="Wartość preferencji"
                  aria-invalid={!!formError}
                  aria-describedby={formError ? "preference-error" : undefined}
                  required
                />
                <Button
                  onClick={handleAddPreference}
                  disabled={isCreating || total >= 50}
                  aria-label="Dodaj preferencję"
                >
                  {isCreating ? "Dodawanie..." : "Dodaj"}
                </Button>
              </div>
              {formError && (
                <p id="preference-error" className="text-red-500 text-xs mt-1" role="alert">
                  {formError}
                </p>
              )}
              {total >= 50 && (
                <p className="text-amber-500 text-xs mt-1" role="alert">
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
          <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4 dark:bg-red-950 dark:text-red-400" role="alert">
            {error.message}
          </div>
        )}

        {isLoading && !preferences.length ? (
          <div className="text-center py-8" aria-live="polite" aria-busy="true">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-muted-foreground">Ładowanie preferencji...</p>
          </div>
        ) : !preferences.length ? (
          <div className="text-center py-8 bg-muted/50 rounded-lg" aria-live="polite">
            <p className="text-muted-foreground">Nie dodano jeszcze żadnych preferencji</p>
            <p className="text-sm mt-1">
              Dodaj swoje preferencje powyżej, aby AI mogło generować lepiej dopasowane przepisy
            </p>
          </div>
        ) : (
          <div className="space-y-6" role="region" aria-label="Lista twoich preferencji">
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
                      categoryLabel={undefined}
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
