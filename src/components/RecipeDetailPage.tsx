import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRecipe } from "../hooks/useRecipe";
import ActionPanel from "./ActionPanel";
import ConfirmDialog from "./ConfirmDialog";
import RecipeFormModal from "./RecipeFormModal";
import AIModal from "./AIModal";
import { useToast } from "../hooks/useToast";
import * as marked from "marked";

interface RecipeDetailPageProps {
  id: string | number;
}

export default function RecipeDetailPage({ id }: RecipeDetailPageProps) {
  const { recipe, isLoading, error, refetch } = useRecipe(id);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const { showToast } = useToast();

  // Funkcje do obsługi akcji
  const handleEdit = () => {
    setIsRecipeFormOpen(true);
  };

  const handleDelete = () => {
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      // W rzeczywistej implementacji tutaj byłoby wywołanie API
      // await deleteRecipe(id)

      // Pokazujemy powiadomienie o sukcesie
      showToast("Przepis został pomyślnie usunięty", "success");

      // Przekierowanie na stronę główną
      window.location.href = "/";
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
    setIsAIModalOpen(true);
  };

  // Obsługa sukcesu po edycji/AI modyfikacji
  const handleSuccess = () => {
    refetch();
    showToast("Operacja zakończona pomyślnie", "success");
  };

  // Renderowanie stanu ładowania
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Ładowanie przepisu...</p>
        </div>
      </div>
    );
  }

  // Renderowanie błędu
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950">
        <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Wystąpił błąd</h3>
        <p className="text-red-600 dark:text-red-400">{error.message}</p>
        <Button
          variant="outline"
          className="mt-4 border-red-200 text-red-600 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900"
          onClick={() => refetch()}
        >
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  // Renderowanie gdy nie znaleziono przepisu
  if (!recipe) {
    return (
      <div className="rounded-lg border-2 border-dashed border-muted p-8 text-center">
        <h3 className="mb-2 text-lg font-medium">Nie znaleziono przepisu</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Przepis o podanym identyfikatorze nie istnieje lub został usunięty.
        </p>
        <Button variant="outline" onClick={() => window.history.back()}>
          Powrót
        </Button>
      </div>
    );
  }

  // Konwersja Markdown do HTML dla zawartości przepisu
  const contentHtml = marked.parse(recipe.content);

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
    <div>
      {/* Górny pasek z przyciskiem powrotu i panelem akcji */}
      <div className="mb-8 flex items-center justify-between">
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
        <div dangerouslySetInnerHTML={{ __html: contentHtml }}></div>
      </div>

      {/* Dialog potwierdzenia usunięcia */}
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

      {/* Modal formularza edycji przepisu */}
      <RecipeFormModal
        isOpen={isRecipeFormOpen}
        onClose={() => setIsRecipeFormOpen(false)}
        recipe={recipe}
        onSuccess={handleSuccess}
      />

      {/* Modal AI do modyfikacji przepisu */}
      <AIModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        mode="modify"
        originalRecipe={recipe}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
