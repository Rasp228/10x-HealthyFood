import React, { useState, useEffect } from "react";
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
import { useAI } from "../hooks/useAI";
import { useToast } from "../hooks/useToast";

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

interface AIModalFormValues {
  additional_params: string;
}

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "generate" | "modify";
  originalRecipe?: RecipeReferenceDto;
  onSuccess?: (savedRecipe: RecipeDto) => void;
}

export default function AIModal({ isOpen, onClose, mode, originalRecipe, onSuccess }: AIModalProps) {
  const [formValues, setFormValues] = useState<AIModalFormValues>({
    additional_params: "",
  });

  const {
    generateRecipe,
    modifyRecipe,
    saveAIRecipe,
    resetAIState,
    isGenerating,
    isModifying,
    isSaving,
    generatedRecipe,
    modifiedRecipe,
    error,
  } = useAI();

  const { showToast } = useToast();

  // Reset stanu przy otwarciu/zamknięciu modala
  useEffect(() => {
    if (isOpen) {
      setFormValues({
        additional_params: "",
      });
      resetAIState();
    }
  }, [isOpen, resetAIState]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleGenerate = async () => {
    try {
      const params: GenerateRecipeCommand = {
        additional_params: formValues.additional_params || null,
      };

      await generateRecipe(params);
    } catch (err) {
      console.error("Błąd podczas generowania przepisu:", err);
      showToast("Wystąpił błąd podczas generowania przepisu", "error");
    }
  };

  const handleModify = async () => {
    if (!originalRecipe) {
      showToast("Brak oryginalnego przepisu do modyfikacji", "error");
      return;
    }

    try {
      const params: ModifyRecipeCommand = {
        additional_params: formValues.additional_params || null,
      };

      await modifyRecipe(originalRecipe.id, params);
    } catch (err) {
      console.error("Błąd podczas modyfikacji przepisu:", err);
      showToast("Wystąpił błąd podczas modyfikacji przepisu", "error");
    }
  };

  const handleSave = async () => {
    try {
      const recipeToSave = generatedRecipe?.recipe || modifiedRecipe?.modified_recipe;
      const isNewRecipe = mode === "generate";

      if (!recipeToSave) {
        showToast("Brak przepisu do zapisania", "error");
        return;
      }

      const saveParams: SaveRecipeCommand = {
        recipe: recipeToSave,
        original_recipe_id: isNewRecipe ? undefined : originalRecipe?.id,
        is_new: isNewRecipe,
      };

      const savedRecipe = await saveAIRecipe(saveParams);

      if (savedRecipe) {
        showToast(`Przepis ${isNewRecipe ? "wygenerowany" : "zmodyfikowany"} pomyślnie`, "success");

        if (onSuccess) {
          onSuccess(savedRecipe);
        }

        onClose();
      }
    } catch (err) {
      console.error("Błąd podczas zapisywania przepisu:", err);
      showToast("Wystąpił błąd podczas zapisywania przepisu", "error");
    }
  };

  // Jeśli modal nie jest otwarty, nie renderujemy zawartości
  if (!isOpen) return null;

  // Rezultat operacji AI, który można zapisać
  const aiResult = generatedRecipe || modifiedRecipe;
  const isLoading = isGenerating || isModifying;
  const isSaveLoading = isSaving;
  const recipeToDisplay = generatedRecipe?.recipe || modifiedRecipe?.modified_recipe;
  const hasGenerationResult = !!aiResult;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-card p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {mode === "generate" ? "Generuj przepis z AI" : "Modyfikuj przepis z AI"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-muted"
            disabled={isLoading || isSaveLoading}
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
            {error.message || "Wystąpił błąd podczas operacji AI"}
          </div>
        )}

        {!hasGenerationResult ? (
          <div className="space-y-4">
            {mode === "modify" && originalRecipe && (
              <div className="rounded-md border p-4">
                <h3 className="mb-2 font-medium">{originalRecipe.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {originalRecipe.content.substring(0, 200)}
                  {originalRecipe.content.length > 200 ? "..." : ""}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="additional_params" className="text-sm font-medium">
                Dodatkowe parametry
              </label>
              <textarea
                id="additional_params"
                name="additional_params"
                value={formValues.additional_params}
                onChange={handleChange}
                rows={4}
                className="w-full rounded-md border p-2"
                placeholder={
                  mode === "generate"
                    ? "Wprowadź dodatkowe parametry dla AI, np. 'wegetariański', 'bezglutenowy', 'na lato'..."
                    : "Wprowadź instrukcje modyfikacji, np. 'zrób wersję bezglutenową', 'dodaj więcej warzyw'..."
                }
                disabled={isLoading}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">{formValues.additional_params.length}/5000 znaków</p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={mode === "generate" ? handleGenerate : handleModify}
                disabled={isLoading}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
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
                    Przetwarzanie...
                  </span>
                ) : mode === "generate" ? (
                  "Generuj przepis"
                ) : (
                  "Modyfikuj przepis"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-md border p-6">
              <h3 className="mb-2 text-xl font-bold">{recipeToDisplay?.title}</h3>
              <div className="whitespace-pre-wrap text-sm">{recipeToDisplay?.content}</div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => resetAIState()} disabled={isSaveLoading}>
                Odrzuć i zacznij ponownie
              </Button>

              <Button
                onClick={handleSave}
                disabled={isSaveLoading}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {isSaveLoading ? (
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
                  "Akceptuj i zapisz"
                )}
              </Button>
            </div>
          </div>
        )}

        {hasGenerationResult && (
          <div className="mt-4 text-xs text-muted-foreground">
            <p>Model AI: {generatedRecipe?.ai_model || modifiedRecipe?.ai_model}</p>
            <p>
              Czas przetwarzania: {generatedRecipe?.generate_response_time || modifiedRecipe?.generate_response_time}ms
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
