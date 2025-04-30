import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  RecipeDto,
  RecipeReferenceDto,
  RecipeBasicDto,
  GeneratedRecipeDto,
  ModifiedRecipeDto,
  GenerateRecipeCommand,
  ModifyRecipeCommand,
  SaveRecipeCommand,
} from "../types";

// Hook do obsługi operacji AI będzie tutaj zamiast faktycznych wywołań API
// W rzeczywistej implementacji powinien być przeniesiony do osobnego pliku
function useAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Generowanie nowego przepisu
  const generateRecipe = async (params: GenerateRecipeCommand): Promise<GeneratedRecipeDto> => {
    setIsLoading(true);
    setError(null);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch("/api/ai/generate-recipe", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(params)
      // });

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const mockResult: GeneratedRecipeDto = {
        recipe: {
          title: "Śniadaniowy bowl z owocami i jogurtem",
          content:
            "# Śniadaniowy bowl z owocami i jogurtem\n\n## Składniki\n- 150g jogurtu greckiego\n- 1 banan\n- garść malin\n- garść borówek\n- 1 łyżka miodu\n- 2 łyżki granoli\n\n## Przygotowanie\n1. Jogurt grecki umieść w misce.\n2. Pokrój banana w plasterki i ułóż na jogurcie.\n3. Dodaj maliny i borówki.\n4. Posyp granolą i polej miodem.\n5. Smacznego!",
          additional_params: params.additional_params,
        },
        ai_model: "recipe-gpt-v1",
        generate_response_time: 1.45,
      };

      return mockResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas generowania przepisu");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Modyfikacja istniejącego przepisu
  const modifyRecipe = async (id: number, params: ModifyRecipeCommand): Promise<ModifiedRecipeDto> => {
    setIsLoading(true);
    setError(null);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch(`/api/ai/modify-recipe/${id}`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(params)
      // });

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Tworzymy przykładowy przepis wejściowy
      const originalRecipe: RecipeReferenceDto = {
        id,
        title: "Sałatka z kurczakiem i awokado",
        content:
          "# Sałatka z kurczakiem i awokado\n\n## Składniki\n- 200g piersi z kurczaka\n- 1 awokado\n- mix sałat\n- pomidorki koktajlowe\n- oliwa z oliwek\n- sól i pieprz\n\n## Przygotowanie\n1. Kurczaka przypraw i usmaż.\n2. Pokrój awokado i pomidorki.\n3. Wymieszaj wszystkie składniki.\n4. Polej oliwą i przypraw.",
      };

      const mockResult: ModifiedRecipeDto = {
        original_recipe: originalRecipe,
        modified_recipe: {
          title: "Wegetariańska sałatka z tofu i awokado",
          content:
            "# Wegetariańska sałatka z tofu i awokado\n\n## Składniki\n- 200g tofu\n- 1 awokado\n- mix sałat\n- pomidorki koktajlowe\n- czerwona cebula\n- oliwa z oliwek\n- ocet balsamiczny\n- sól i pieprz\n\n## Przygotowanie\n1. Tofu pokrój w kostkę i podsmaż na patelni.\n2. Pokrój awokado, pomidorki i cebulę.\n3. Wymieszaj wszystkie składniki na talerzu.\n4. Przygotuj dressing z oliwy i octu balsamicznego.\n5. Polej sałatkę dressingiem i dopraw do smaku.",
          additional_params: params.additional_params,
        },
        ai_model: "recipe-gpt-v1",
        generate_response_time: 1.78,
      };

      return mockResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas modyfikacji przepisu");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Zapisywanie przepisu z AI
  const saveAIRecipe = async (params: SaveRecipeCommand): Promise<RecipeDto> => {
    setIsLoading(true);
    setError(null);

    try {
      // W rzeczywistej implementacji wywołalibyśmy API
      // const response = await fetch("/api/ai/save-recipe", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(params)
      // });

      // Mockujemy odpowiedź z opóźnieniem
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const mockResult: RecipeDto = {
        id: Math.floor(Math.random() * 1000) + 100,
        title: params.recipe.title,
        content: params.recipe.content,
        additional_params: params.recipe.additional_params || null,
        user_id: "123",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ai_generated: true,
        original_recipe_id: params.original_recipe_id || null,
      };

      return mockResult;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas zapisywania przepisu");
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    generateRecipe,
    modifyRecipe,
    saveAIRecipe,
    isLoading,
    error,
  };
}

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "generate" | "modify";
  recipe?: RecipeDto; // Tylko w trybie "modify"
  onSuccess?: () => void;
}

export default function AIModal({ isOpen, onClose, mode, recipe, onSuccess }: AIModalProps) {
  const [formValues, setFormValues] = useState<{ additional_params: string }>({
    additional_params: "",
  });
  const [generatedResult, setGeneratedResult] = useState<{
    recipe: RecipeBasicDto;
    isReady: boolean;
  } | null>(null);

  const { generateRecipe, modifyRecipe, saveAIRecipe, isLoading, error } = useAI();

  // Obsługa zmiany pola dodatkowych parametrów
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormValues({ ...formValues, additional_params: e.target.value });
  };

  // Funkcja do generowania lub modyfikacji przepisu
  const handleGenerate = async () => {
    try {
      if (mode === "generate") {
        // Tryb generowania nowego przepisu
        const result = await generateRecipe({
          additional_params: formValues.additional_params || null,
        });

        setGeneratedResult({
          recipe: result.recipe,
          isReady: true,
        });
      } else if (mode === "modify" && recipe) {
        // Tryb modyfikacji istniejącego przepisu
        const result = await modifyRecipe(recipe.id, {
          additional_params: formValues.additional_params || null,
        });

        setGeneratedResult({
          recipe: result.modified_recipe,
          isReady: true,
        });
      }
    } catch (err) {
      console.error("Błąd podczas operacji AI:", err);
    }
  };

  // Funkcja do zapisania wygenerowanego przepisu
  const handleSave = async () => {
    if (!generatedResult) return;

    try {
      const saveParams: SaveRecipeCommand = {
        recipe: generatedResult.recipe,
        original_recipe_id: mode === "modify" && recipe ? recipe.id : undefined,
        is_new: mode === "generate",
      };

      await saveAIRecipe(saveParams);

      // Zamykamy modal i wywołujemy callback sukcesu
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Błąd podczas zapisywania przepisu:", err);
    }
  };

  // Resetujemy stan przy zamknięciu modalu
  const handleClose = () => {
    setFormValues({ additional_params: "" });
    setGeneratedResult(null);
    onClose();
  };

  // Jeśli modal nie jest otwarty, nie renderujemy zawartości
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-card p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {mode === "generate" ? "Generuj nowy przepis z AI" : "Modyfikuj przepis przez AI"}
          </h2>
          <button
            onClick={handleClose}
            className="rounded-full p-2 hover:bg-muted"
            disabled={isLoading}
            aria-label="Zamknij"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
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
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error.message}
          </div>
        )}

        <div className="space-y-6">
          {/* Sekcja opisu istniejącego przepisu (tylko w trybie modify) */}
          {mode === "modify" && recipe && !generatedResult && (
            <div className="rounded-md border p-4">
              <h3 className="mb-2 text-lg font-semibold">{recipe.title}</h3>
              <p className="mb-2 text-sm text-muted-foreground">
                Ten przepis zostanie zmodyfikowany według podanych parametrów.
              </p>
            </div>
          )}

          {/* Sekcja parametrów (widoczna tylko przed generowaniem) */}
          {!generatedResult?.isReady && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="additional_params" className="text-sm font-medium">
                  Parametry dla AI{" "}
                  {mode === "generate" ? "(co chcesz przygotować?)" : "(jak chcesz zmodyfikować przepis?)"}
                </label>
                <textarea
                  id="additional_params"
                  value={formValues.additional_params}
                  onChange={handleChange}
                  rows={4}
                  className="w-full rounded-md border border-input p-2"
                  placeholder={
                    mode === "generate"
                      ? "np. Śniadanie na słodko z owocami, bez glutenu, szybki w przygotowaniu"
                      : "np. Zamień na wersję wegetariańską, dodaj więcej warzyw"
                  }
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Opisz swoje preferencje, ograniczenia dietetyczne lub inne wskazówki dla AI.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      AI pracuje...
                    </>
                  ) : (
                    <>
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
                      {mode === "generate" ? "Generuj przepis" : "Modyfikuj przepis"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Sekcja wyników (widoczna po generowaniu) */}
          {generatedResult?.isReady && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">{generatedResult.recipe.title}</h3>

              <div className="max-h-96 overflow-y-auto rounded-md border p-4">
                <div className="prose prose-sm dark:prose-invert">
                  {generatedResult.recipe.content.split("\n").map((line, index) => (
                    <React.Fragment key={index}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setGeneratedResult(null)} disabled={isLoading}>
                  Wróć i edytuj
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Zapisywanie...
                    </span>
                  ) : (
                    "Zapisz przepis"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
