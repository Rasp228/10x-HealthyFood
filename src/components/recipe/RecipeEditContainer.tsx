import { useState, useEffect } from "react";
import RecipeFormModal from "./RecipeFormModal";

interface RecipeEditContainerProps {
  recipeId: string;
}

export default function RecipeEditContainer({ recipeId }: RecipeEditContainerProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        const response = await fetch(`/api/recipes/${recipeId}`);
        if (!response.ok) {
          throw new Error(`Błąd pobierania przepisu: ${response.status}`);
        }
        const recipeData = await response.json();
        setRecipe(recipeData);
      } catch (error) {
        console.error("Błąd podczas pobierania przepisu:", error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (recipeId) {
      fetchRecipe();
    }
  }, [recipeId]);

  const handleClose = () => {
    setIsOpen(false);
    window.location.href = `/recipes/${recipeId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-lg">Ładowanie...</div>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="p-4 rounded-lg border-2 border-red-300 text-center">
        <h3 className="text-lg font-medium mb-2">Nie znaleziono przepisu</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Przepis o podanym ID nie istnieje lub wystąpił błąd podczas jego pobierania.
        </p>
        <a
          href="/"
          className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Powrót do strony głównej
        </a>
      </div>
    );
  }

  return <RecipeFormModal isOpen={isOpen} recipe={recipe} onClose={handleClose} />;
}
