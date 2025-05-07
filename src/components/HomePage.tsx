import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import RecipeCard from "./RecipeCard";
import ConfirmDialog from "./ConfirmDialog";
import { useToast } from "../hooks/useToast";
import { useFetchRecipes } from "../hooks/useRecipes";

export default function HomePage() {
  const [filterText, setFilterText] = useState("");
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [paginationParams, setPaginationParams] = useState({
    limit: 9,
    offset: 0,
    sort: "created_at" as const,
    order: "desc" as const,
  });
  const [recipeToDelete, setRecipeToDelete] = useState<number | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const { showToast } = useToast();

  // Użycie hooka do pobrania przepisów
  const { data: recipes, total, isLoading, error, refetch } = useFetchRecipes(paginationParams);

  // Obsługa zmiany filtra
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    // W rzeczywistej implementacji użylibyśmy debounce
    // i wysłalibyśmy zapytanie do API z parametrem filtrowania
  };

  // Obsługa stronicowania
  const handleNextPage = () => {
    if (paginationParams.offset + paginationParams.limit < total) {
      setPaginationParams((prev) => ({
        ...prev,
        offset: prev.offset + prev.limit,
      }));
    }
  };

  const handlePrevPage = () => {
    if (paginationParams.offset > 0) {
      setPaginationParams((prev) => ({
        ...prev,
        offset: Math.max(0, prev.offset - prev.limit),
      }));
    }
  };

  // Obsługa akcji na przepisach
  const handleEditRecipe = (id: number) => {
    console.log(`Edycja przepisu o id ${id}`);
    setIsRecipeFormOpen(true);
    // W rzeczywistej implementacji przekazalibyśmy id do modalu formularza
  };

  const handleDeleteRecipe = (id: number) => {
    // Zapisujemy ID przepisu do usunięcia i otwieramy dialog potwierdzenia
    setRecipeToDelete(id);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (recipeToDelete === null) return;

    try {
      console.log(`Usuwanie przepisu o id ${recipeToDelete}`);
      // W rzeczywistej implementacji wykonywalibyśmy faktyczne usunięcie
      // await deleteRecipe(recipeToDelete)

      // Pokazujemy powiadomienie o sukcesie
      showToast("Przepis został pomyślnie usunięty", "success");

      // Odświeżamy listę przepisów
      refetch();
    } catch (err) {
      // Pokazujemy powiadomienie o błędzie
      let errorMessage = "Wystąpił błąd podczas usuwania przepisu";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      showToast(errorMessage, "error");
    } finally {
      // Zamykamy dialog i resetujemy stan
      setIsConfirmDeleteOpen(false);
      setRecipeToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setIsConfirmDeleteOpen(false);
    setRecipeToDelete(null);
  };

  const handleAIRecipe = (id: number) => {
    console.log(`Modyfikacja przepisu przez AI dla id ${id}`);
    setIsAIModalOpen(true);
    // W rzeczywistej implementacji przekazalibyśmy id do modalu AI
  };

  // Renderowanie stanu ładowania
  if (isLoading && recipes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Ładowanie przepisów...</p>
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

  return (
    <div>
      {/* Górny pasek z wyszukiwaniem i przyciskami akcji */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <input
            type="search"
            placeholder="Szukaj przepisów..."
            className="w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterText}
            onChange={handleFilterChange}
          />
          {filterText && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setFilterText("")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18"></path>
                <path d="m6 6 12 12"></path>
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsAIModalOpen(true)} className="gap-2 text-purple-500">
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
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m4.9 4.9 14.2 14.2"></path>
              <path d="M9 9h.01"></path>
              <path d="M15 15h.01"></path>
            </svg>
            Wygeneruj z AI
          </Button>

          <Button variant="default" onClick={() => setIsRecipeFormOpen(true)} className="gap-2">
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
              <path d="M12 5v14"></path>
              <path d="M5 12h14"></path>
            </svg>
            Dodaj przepis
          </Button>
        </div>
      </div>

      {/* Lista przepisów */}
      {recipes.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <h3 className="mb-2 text-lg font-medium">Brak przepisów</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            Nie znaleziono żadnych przepisów. Dodaj nowy przepis lub wygeneruj z pomocą AI.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => setIsAIModalOpen(true)} className="gap-2">
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
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m4.9 4.9 14.2 14.2"></path>
                <path d="M9 9h.01"></path>
                <path d="M15 15h.01"></path>
              </svg>
              Wygeneruj z AI
            </Button>

            <Button variant="default" onClick={() => setIsRecipeFormOpen(true)} className="gap-2">
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
                <path d="M12 5v14"></path>
                <path d="M5 12h14"></path>
              </svg>
              Dodaj przepis
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onEdit={handleEditRecipe}
                onDelete={handleDeleteRecipe}
                onAI={handleAIRecipe}
              />
            ))}
          </div>

          {/* Paginacja */}
          <div className="mt-8 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Wyświetlanie {paginationParams.offset + 1}-{Math.min(paginationParams.offset + recipes.length, total)} z{" "}
              {total}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrevPage} disabled={paginationParams.offset === 0}>
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
                  className="mr-2"
                >
                  <path d="m15 18-6-6 6-6"></path>
                </svg>
                Poprzednia
              </Button>

              <Button
                variant="outline"
                onClick={handleNextPage}
                disabled={paginationParams.offset + paginationParams.limit >= total}
              >
                Następna
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
                  className="ml-2"
                >
                  <path d="m9 18 6-6-6-6"></path>
                </svg>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Dialog potwierdzenia usunięcia */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Usuń przepis"
        message="Czy na pewno chcesz usunąć ten przepis? Tej operacji nie można cofnąć."
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="danger"
      />
    </div>
  );
}
