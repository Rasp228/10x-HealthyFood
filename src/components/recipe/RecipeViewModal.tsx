import React, { useCallback } from "react";
import BaseModal from "@/components/ui/BaseModal";
import RecipeDetailContent from "./RecipeDetailContent";
import { useRecipeModal } from "../../hooks/recipe/useRecipeModal";

interface RecipeViewModalContainerProps {
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
}

export default function RecipeViewModalContainer({ onEdit, onDelete, onAI }: RecipeViewModalContainerProps) {
  const { isOpen, recipeId, recipe, isLoading, error, closeModal } = useRecipeModal();

  // Obsługa akcji - przekazanie callbacków z ID
  const handleEdit = useCallback(() => {
    if (recipeId && onEdit) {
      onEdit(recipeId); // Nie zamykaj modala szczegółów
    }
  }, [recipeId, onEdit]);

  const handleDelete = useCallback(() => {
    if (recipeId && onDelete) {
      onDelete(recipeId);
      closeModal(); // Zamknij modal tylko po usunięciu
    }
  }, [recipeId, onDelete, closeModal]);

  const handleAI = useCallback(() => {
    if (recipeId && onAI) {
      onAI(recipeId); // Nie zamykaj modala szczegółów
    }
  }, [recipeId, onAI]);

  return (
    <BaseModal isOpen={isOpen} onClose={closeModal} title="Szczegóły przepisu" maxWidth="5xl">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950">
          <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Wystąpił błąd</h3>
          <p className="text-red-600 dark:text-red-400">{error.message}</p>
        </div>
      ) : (
        <RecipeDetailContent
          recipe={recipe}
          isLoading={isLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAI={handleAI}
          showBackButton={false}
          className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-100"
        />
      )}
    </BaseModal>
  );
}
