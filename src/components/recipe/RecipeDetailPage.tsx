import React, { useState } from "react";
import { useRecipe } from "../../hooks/recipe/useRecipe";
import { useToast } from "../../hooks/common/useToast";
import { RecipeService } from "../../lib/services/recipe.service";
import RecipeDetailContent from "./RecipeDetailContent";
import RecipeFormModal from "./RecipeFormModal";
import AIModal from "../ai/AIModal";
import ConfirmDialog from "../common/ConfirmDialog";
import ToastContainer from "../feedback/ToastContainer";

interface RecipeDetailPageProps {
  id: string | number;
}

export default function RecipeDetailPage({ id }: RecipeDetailPageProps) {
  const { recipe, isLoading, error, refetch } = useRecipe(id);
  const { showToast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Po edycji lub modyfikacji AI zostajemy na tej samej stronie, więc przeładowujemy przepis
  const handleSuccess = () => {
    refetch();
    showToast("Operacja zakończona pomyślnie", "success");
  };

  // Usunięcie kończy się powrotem na stronę główną - przepisu już nie ma czego wyświetlać
  const handleConfirmDelete = async () => {
    if (!recipe) return;

    try {
      const recipeService = new RecipeService();
      const success = await recipeService.deleteRecipe(recipe.id);

      if (!success) {
        throw new Error("Nie można usunąć przepisu - możliwe, że już nie istnieje");
      }

      window.location.href = "/";
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Wystąpił błąd podczas usuwania przepisu", "error");
    } finally {
      setIsConfirmDeleteOpen(false);
    }
  };

  return (
    <>
      <RecipeDetailContent
        recipe={recipe}
        isLoading={isLoading}
        error={error}
        onEdit={() => setIsFormOpen(true)}
        onDelete={() => setIsConfirmDeleteOpen(true)}
        onAI={() => setIsAIOpen(true)}
        showBackButton={true}
      />

      <RecipeFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        recipe={recipe || undefined}
        onSuccess={handleSuccess}
      />

      <AIModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        mode="modify"
        originalRecipe={recipe || undefined}
        onSuccess={handleSuccess}
      />

      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Usuń przepis"
        message="Czy na pewno chcesz usunąć ten przepis? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsConfirmDeleteOpen(false)}
        severity="danger"
      />

      <ToastContainer />
    </>
  );
}
