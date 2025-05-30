import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import ActionPanel from "./ActionPanel";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "../hooks/useToast";
import { RecipeService } from "../lib/services/recipe.service";
import { marked } from "marked";
import type { RecipeDetailContentProps } from "../types";

export default function RecipeDetailContent({
  recipe,
  isLoading = false,
  error,
  onEdit,
  onDelete,
  onAI,
  onSuccess,
  showBackButton = false,
  className = "",
}: RecipeDetailContentProps) {
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const { showToast } = useToast();

  // Funkcje do obsługi akcji
  const handleEdit = () => {
    onEdit?.(); // Tylko wywołaj callback, nie otwieraj własnego modala
  };

  const handleDelete = () => {
    setIsConfirmDeleteOpen(true); // Pozostaw dialog potwierdzenia usunięcia
  };

  const handleConfirmDelete = async () => {
    try {
      const recipeService = new RecipeService();

      if (!recipe?.id || recipe.id <= 0) {
        throw new Error("Nieprawidłowe ID przepisu");
      }

      // Używamy rzeczywistego API zamiast mockowanych danych
      const success = await recipeService.deleteRecipe(recipe.id, "current-user");

      if (success) {
        // Pokazujemy powiadomienie o sukcesie
        showToast("Przepis został pomyślnie usunięty", "success");

        // Wywołujemy callback delete z ID
        onDelete?.();
        onSuccess?.();
      } else {
        throw new Error("Nie można usunąć przepisu - możliwe, że już nie istnieje");
      }
    } catch (err) {
      // Pokazujemy powiadomienie o błędzie
      let errorMessage = "Wystąpił błąd podczas usuwania przepisu";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      showToast(errorMessage, "error");
    } finally {
      setIsConfirmDeleteOpen(false);
    }
  };

  const handleCancelDelete = () => {
    setIsConfirmDeleteOpen(false);
  };

  const handleAIModify = () => {
    onAI?.(); // Tylko wywołaj callback, nie otwieraj własnego modala
  };

  // Renderowanie błędu
  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950 ${className}`}
      >
        <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Wystąpił błąd</h3>
        <p className="text-red-600 dark:text-red-400">{error.message}</p>
      </div>
    );
  }

  // Renderowanie stanu ładowania
  if (isLoading) {
    return (
      <div className={`flex h-64 items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Ładowanie przepisu...</p>
        </div>
      </div>
    );
  }

  // Renderowanie gdy nie ma przepisu
  if (!recipe) {
    return (
      <div className={`rounded-lg border-2 border-dashed border-muted p-8 text-center ${className}`}>
        <h3 className="mb-2 text-lg font-medium">Nie znaleziono przepisu</h3>
        <p className="mb-4 text-sm text-muted-foreground">Przepis nie został załadowany lub wystąpił błąd.</p>
      </div>
    );
  }

  // Formatowanie daty
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className={className}>
      {/* Górny pasek z przyciskiem powrotu (opcjonalnym) i panelem akcji */}
      <div className="mb-8 flex items-center justify-between">
        {showBackButton && (
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6"></path>
            </svg>
            Powrót
          </Button>
        )}
        {!showBackButton && <div></div>} {/* Spacer gdy nie ma przycisku powrotu */}
        <ActionPanel onEdit={handleEdit} onDelete={handleDelete} onAI={handleAIModify} />
      </div>

      {/* Nagłówek przepisu */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">{recipe.title}</h1>

          {/* Etykieta AI jeśli przepis jest wygenerowany przez AI */}
          {recipe.ai_generated && (
            <div className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              AI
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div>Utworzono: {formatDate(recipe.created_at)}</div>
          {recipe.updated_at !== recipe.created_at && <div>Zaktualizowano: {formatDate(recipe.updated_at)}</div>}
        </div>

        {/* Opcjonalne tagi/parametry */}
        {recipe.additional_params && (
          <div className="mt-4 flex flex-wrap gap-1">
            {recipe.additional_params.split(",").map((tag, index) => (
              <span key={index} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {tag.trim()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Treść przepisu */}
      <div className="prose prose-slate mx-auto dark:prose-invert lg:prose-lg">
        <div dangerouslySetInnerHTML={{ __html: marked.parse(recipe.content) }}></div>
      </div>

      {/* Dialog potwierdzenia usunięcia - pozostaje tutaj */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Usuń przepis"
        message={`Czy na pewno chcesz usunąć przepis "${recipe.title}"? Tej operacji nie można cofnąć.`}
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="danger"
      />
    </div>
  );
}
