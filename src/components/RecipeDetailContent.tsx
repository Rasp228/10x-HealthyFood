import React from "react";
import { BackButton } from "@/components/ui/ActionButtons";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import RecipeContent from "@/components/ui/RecipeContent";
import ActionPanel from "./ActionPanel";

import type { RecipeDetailContentProps } from "../types";

export default function RecipeDetailContent({
  recipe,
  isLoading = false,
  error,
  onEdit,
  onDelete,
  onAI,
  showBackButton = false,
  className = "",
}: RecipeDetailContentProps) {
  // Funkcje do obsługi akcji
  const handleEdit = () => {
    onEdit?.(); // Tylko wywołaj callback, nie otwieraj własnego modala
  };

  const handleDelete = () => {
    // Bezpośrednio wywołaj callback - pozwól rodzicowi obsłużyć logikę usuwania
    onDelete?.();
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
        <LoadingSpinner size="lg" message="Ładowanie przepisu..." />
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
        {showBackButton && <BackButton onClick={() => window.history.back()}>Powrót</BackButton>}
        {!showBackButton && <div></div>} {/* Spacer gdy nie ma przycisku powrotu */}
        <ActionPanel onEdit={handleEdit} onDelete={handleDelete} onAI={handleAIModify} />
      </div>

      {/* Nagłówek przepisu */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">{recipe.title}</h1>

          {/* Etykieta AI jeśli przepis jest wygenerowany przez AI */}
          {recipe.is_ai_generated && (
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

      {/* Treść przepisu - teraz używa RecipeContent zamiast dangerouslySetInnerHTML */}
      <RecipeContent content={recipe.content} className="mx-auto" />
    </div>
  );
}
