import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import RecipeCard from "./RecipeCard";
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
    console.log(`Usuwanie przepisu o id ${id}`);
    // W rzeczywistej implementacji otwieralibyśmy dialog potwierdzenia
    if (window.confirm("Czy na pewno chcesz usunąć ten przepis?")) {
      // Tutaj wykonywalibyśmy faktyczne usunięcie
      // await deleteRecipe(id)
      // refetch()
    }
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
        <div className="flex gap-2">
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
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.29 7 12 12 20.71 7"></polyline>
              <line x1="12" y1="22" x2="12" y2="12"></line>
            </svg>
            Generuj z AI
          </Button>
          <Button onClick={() => setIsRecipeFormOpen(true)}>
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
              <path d="M5 12h14"></path>
              <path d="M12 5v14"></path>
            </svg>
            Dodaj przepis
          </Button>
        </div>
      </div>

      {/* Lista przepisów */}
      {recipes.length === 0 ? (
        <div className="mt-12 rounded-lg border-2 border-dashed border-muted p-8 text-center">
          <svg
            className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
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
            <path d="M8 3v3a2 2 0 0 1-2 2H3"></path>
            <path d="M21 8v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"></path>
            <path d="M21 12H8"></path>
            <path d="M8 16h13"></path>
          </svg>
          <h3 className="mb-2 text-lg font-medium">Brak przepisów</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Nie znaleziono żadnych przepisów. Dodaj swój pierwszy przepis lub wygeneruj go za pomocą AI.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => setIsAIModalOpen(true)}>
              Generuj z AI
            </Button>
            <Button onClick={() => setIsRecipeFormOpen(true)}>Dodaj przepis</Button>
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

      {/* Tu w rzeczywistej implementacji byłyby modale:
          - Modal formularza przepisu (RecipeFormModal) 
          - Modal AI (AIModal)
      */}
    </div>
  );
}
