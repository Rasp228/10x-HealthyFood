import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AddButton, AIButton } from "@/components/ui/ActionButtons";
import RecipeCard from "./RecipeCard";
import ConfirmDialog from "./ConfirmDialog";
import RecipeFormModal from "./RecipeFormModal";
import AIModal from "./AIModal";
import RecipeViewModalContainer from "./RecipeViewModal";
import { useRecipeModal } from "../hooks/useRecipeModal";
import { useToast } from "../hooks/useToast";
import { useFetchRecipes } from "../hooks/useRecipes";
import { RecipeService } from "../lib/services/recipe.service";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export default function HomePage() {
  const [filterText, setFilterText] = useState("");
  const [debouncedFilterText, setDebouncedFilterText] = useState("");
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isRecipeFormOpen, setIsRecipeFormOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [sortParams, setSortParams] = useState({
    sort: "created_at" as "created_at" | "updated_at" | "title",
    order: "desc" as "desc" | "asc",
  });
  const [recipeToDelete, setRecipeToDelete] = useState<number | null>(null);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const { showToast } = useToast();

  // Hook do obsługi modala szczegółów
  const { openModal, closeModal } = useRecipeModal();

  // Użycie hooka do pobrania wszystkich przepisów z uwzględnieniem wyszukiwania i sortowania
  const {
    data: recipes,
    total,
    isLoading,
    error,
    refetch,
  } = useFetchRecipes({
    ...sortParams,
    search: debouncedFilterText,
    // Pobieramy wszystkie przepisy
  });

  // Implementacja debounce dla wyszukiwania
  useEffect(() => {
    // Ustawiamy timeout dla debounce
    const timeoutId = setTimeout(() => {
      setDebouncedFilterText(filterText);
    }, 500); // 500ms opóźnienia

    // Sprzątamy timeout jeśli komponent zostanie odmontowany lub zmieni się filterText
    return () => clearTimeout(timeoutId);
  }, [filterText]);

  // Obsługa zmiany filtra
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
  };

  // Resetowanie wyszukiwania
  const handleClearSearch = useCallback(() => {
    setFilterText("");
    setDebouncedFilterText("");
  }, []);

  // Obsługa sortowania
  const handleSortChange = (sortField: "created_at" | "updated_at" | "title") => {
    setSortParams((prev) => ({
      ...prev,
      sort: sortField,
    }));
  };

  const handleOrderChange = () => {
    setSortParams((prev) => ({
      ...prev,
      order: prev.order === "desc" ? "asc" : "desc",
    }));
  };

  // Obsługa akcji na przepisach
  const handleEditRecipe = (id: number) => {
    setSelectedRecipeId(id);
    setIsRecipeFormOpen(true);
  };

  const handleDeleteRecipe = (id: number) => {
    // Zapisujemy ID przepisu do usunięcia i otwieramy dialog potwierdzenia
    setRecipeToDelete(id);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (recipeToDelete === null) return;

    try {
      const recipeService = new RecipeService();
      const success = await recipeService.deleteRecipe(recipeToDelete, "current-user");

      if (success) {
        // Pokazujemy powiadomienie o sukcesie
        showToast("Przepis został pomyślnie usunięty", "success");

        // Odświeżamy listę przepisów
        refetch();
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
    setSelectedRecipeId(id);
    setIsAIModalOpen(true);
  };

  // Obsługa otwierania modala szczegółów przepisu
  const handleViewRecipe = (id: number) => {
    openModal(id);
  };

  // Obsługa sukcesu po dodaniu/edycji/AI modyfikacji
  const handleRecipeSuccess = () => {
    refetch();
    showToast("Operacja zakończona pomyślnie", "success");
  };

  // Obsługa zamknięcia modala szczegółów po udanej edycji
  const handleCloseAfterEdit = () => {
    closeModal();
  };

  // Status wyszukiwania
  const isSearching = debouncedFilterText !== "" && isLoading;

  // Renderowanie stanu ładowania przy pierwszym ładowaniu
  if (isLoading && recipes.length === 0 && !debouncedFilterText) {
    return <LoadingSpinner className="py-8" message="Ładowanie przepisów..." />;
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

  // Znajdź wybrany przepis (dla modalu edycji lub AI)
  const selectedRecipe = selectedRecipeId ? recipes.find((recipe) => recipe.id === selectedRecipeId) : null;

  return (
    <div data-testid="homepage">
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
            aria-label="Wyszukaj przepisy"
            data-testid="search-recipes-input"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <LoadingSpinner size="sm" />
            </div>
          )}
          {filterText && !isSearching && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={handleClearSearch}
              aria-label="Wyczyść wyszukiwanie"
              data-testid="clear-search-button"
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
          {/* Sortowanie */}
          <div className="relative mr-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={sortParams.sort}
              onChange={(e) => handleSortChange(e.target.value as "created_at" | "updated_at" | "title")}
              aria-label="Sortuj według"
              data-testid="sort-select"
            >
              <option value="created_at">Data utworzenia</option>
              <option value="updated_at">Data aktualizacji</option>
              <option value="title">Tytuł</option>
            </select>
            <button
              onClick={handleOrderChange}
              className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-muted"
              aria-label={sortParams.order === "desc" ? "Sortuj malejąco" : "Sortuj rosnąco"}
              data-testid="sort-order-button"
            >
              {sortParams.order === "desc" ? (
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
                  <path d="m3 8 4-4 4 4" />
                  <path d="M7 4v16" />
                  <path d="M11 12h4" />
                  <path d="M11 16h7" />
                  <path d="M11 20h10" />
                </svg>
              ) : (
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
                  <path d="m3 16 4 4 4-4" />
                  <path d="M7 20V4" />
                  <path d="M11 4h4" />
                  <path d="M11 8h7" />
                  <path d="M11 12h10" />
                </svg>
              )}
            </button>
          </div>

          <AIButton
            onClick={() => {
              setSelectedRecipeId(null);
              setIsAIModalOpen(true);
            }}
            data-testid="ai-generate-button"
          >
            Wygeneruj z AI
          </AIButton>

          <AddButton
            onClick={() => {
              setSelectedRecipeId(null);
              setIsRecipeFormOpen(true);
            }}
            data-testid="add-recipe-button-main"
          >
            Dodaj przepis
          </AddButton>
        </div>
      </div>

      {/* Informacja o wynikach wyszukiwania */}
      {debouncedFilterText && (
        <div className="mb-4" data-testid="search-results-info">
          <p className="text-sm text-muted-foreground">
            Znaleziono {total} wyników dla &quot;{debouncedFilterText}&quot;
          </p>
        </div>
      )}

      {/* Lista przepisów */}
      {recipes.length === 0 ? (
        <div
          className="rounded-lg border-2 border-dashed border-muted p-12 text-center"
          data-testid="empty-recipes-state"
        >
          <h3 className="mb-2 text-xl font-medium">
            {debouncedFilterText ? "Nie znaleziono przepisów" : "Brak przepisów"}
          </h3>
          <p className="mb-6 text-muted-foreground">
            {debouncedFilterText
              ? `Nie znaleziono przepisów pasujących do "${debouncedFilterText}".`
              : "Nie dodano jeszcze żadnych przepisów."}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              if (debouncedFilterText) {
                handleClearSearch();
              } else {
                setIsRecipeFormOpen(true);
              }
            }}
            data-testid="empty-state-action-button"
          >
            {debouncedFilterText ? "Wyczyść wyszukiwanie" : "Dodaj pierwszy przepis"}
          </Button>
        </div>
      ) : (
        <div data-testid="recipes-grid">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onEdit={() => handleEditRecipe(recipe.id)}
                onDelete={() => handleDeleteRecipe(recipe.id)}
                onAI={() => handleAIRecipe(recipe.id)}
                onView={() => handleViewRecipe(recipe.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal formularza dodawania/edycji przepisu */}
      <RecipeFormModal
        isOpen={isRecipeFormOpen}
        onClose={() => setIsRecipeFormOpen(false)}
        recipe={selectedRecipe || undefined}
        onSuccess={handleRecipeSuccess}
        onEditSuccess={handleCloseAfterEdit}
      />

      {/* Modal AI */}
      <AIModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        mode={selectedRecipeId ? "modify" : "generate"}
        originalRecipe={selectedRecipe || undefined}
        onSuccess={handleRecipeSuccess}
        onEditSuccess={handleCloseAfterEdit}
      />

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

      {/* Modal szczegółów przepisu */}
      <RecipeViewModalContainer onEdit={handleEditRecipe} onDelete={handleDeleteRecipe} onAI={handleAIRecipe} />
    </div>
  );
}
