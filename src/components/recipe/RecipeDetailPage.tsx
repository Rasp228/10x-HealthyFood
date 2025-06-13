import React from "react";
import { useRecipe } from "../../hooks/recipe/useRecipe";
import RecipeDetailContent from "./RecipeDetailContent";

interface RecipeDetailPageProps {
  id: string | number;
}

export default function RecipeDetailPage({ id }: RecipeDetailPageProps) {
  const { recipe, isLoading, error, refetch } = useRecipe(id);

  // Obsługa sukcesu po operacjach
  const handleSuccess = () => {
    refetch();
  };

  // Obsługa usuwania - przekierowanie na stronę główną
  const handleDelete = () => {
    window.location.href = "/";
  };

  return (
    <RecipeDetailContent
      recipe={recipe}
      isLoading={isLoading}
      error={error}
      onSuccess={handleSuccess}
      onDelete={handleDelete}
      showBackButton={true}
    />
  );
}
