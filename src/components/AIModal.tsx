import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { RecipeDto, GenerateRecipeCommand, ModifyRecipeCommand, SaveRecipeCommand } from "../types";
import { useAI } from "../hooks/useAI";
import { useToast } from "../hooks/useToast";

interface AIModalFormValues {
  additional_params: string;
}

interface AIModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "generate" | "modify";
  originalRecipe?: RecipeDto;
  onSuccess?: () => void;
}

export default function AIModal({ isOpen, onClose, mode, originalRecipe, onSuccess }: AIModalProps) {
  const [formValues, setFormValues] = useState<AIModalFormValues>({
    additional_params: "",
  });
  const [step, setStep] = useState<"input" | "preview">("input");

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

  // Reset stanu przy zamykaniu/otwieraniu modala
  useEffect(() => {
    if (!isOpen) {
      setStep("input");
      resetAIState();
      setFormValues({
        additional_params: "",
      });
    }
  }, [isOpen, resetAIState]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Obsługa operacji AI
  const handleAIOperation = async () => {
    try {
      if (mode === "generate") {
        const params: GenerateRecipeCommand = {
          additional_params: formValues.additional_params,
        };
        await generateRecipe(params);
      } else if (mode === "modify" && originalRecipe) {
        const params: ModifyRecipeCommand = {
          additional_params: formValues.additional_params,
        };
        await modifyRecipe(originalRecipe.id, params);
      }
      setStep("preview");
    } catch (err) {
      if (err instanceof Error) {
        showToast(err.message, "error");
      }
    }
  };

  // Obsługa zapisywania przepisu
  const handleSave = async () => {
    try {
      const recipeToSave = generatedRecipe?.recipe || modifiedRecipe?.modified_recipe;
      if (!recipeToSave) return;

      const saveParams: SaveRecipeCommand = {
        recipe: recipeToSave,
        is_new: mode === "generate",
        original_recipe_id: mode === "modify" && originalRecipe ? originalRecipe.id : undefined,
      };

      const savedRecipe = await saveAIRecipe(saveParams);

      if (savedRecipe) {
        showToast(`Przepis "${savedRecipe.title}" został zapisany.`, "success");

        if (onSuccess) {
          onSuccess();
        }

        onClose();
      }
    } catch (err) {
      if (err instanceof Error) {
        showToast(err.message, "error");
      }
    }
  };

  // Przygotowanie zmiennych stanu
  const isLoading = isGenerating || isModifying;
  const isSaveLoading = isSaving;
  const recipeToDisplay = generatedRecipe?.recipe || modifiedRecipe?.modified_recipe;

  // Jeśli modal jest zamknięty, nie renderujemy
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-3xl rounded-lg bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {mode === "generate" ? "Wygeneruj przepis z AI" : "Modyfikuj przepis z AI"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <svg
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
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </Button>
        </div>

        {step === "input" ? (
          <div className="space-y-4">
            {mode === "modify" && originalRecipe && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-medium">Modyfikujesz przepis: {originalRecipe.title}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="additional_params" className="block text-sm font-medium">
                Dodatkowe parametry lub instrukcje dla AI
              </label>
              <textarea
                id="additional_params"
                name="additional_params"
                value={formValues.additional_params}
                onChange={handleChange}
                className="h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={
                  mode === "generate"
                    ? "Dodaj szczegóły, preferencje, ograniczenia itp. np. 'wegetariańskie, bez glutenu, danie na szybki obiad'"
                    : "Opisz, jak chcesz zmodyfikować przepis, np. 'dodaj więcej warzyw, zmniejsz kaloryczność, dostosuj do diety keto'"
                }
              />
              <p className="text-xs text-muted-foreground">
                Im więcej szczegółów podasz, tym lepiej AI dostosuje przepis do Twoich potrzeb.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Anuluj
              </Button>
              <Button onClick={handleAIOperation} disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Przetwarzanie...
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
                      <circle cx="12" cy="12" r="10" />
                      <path d="m4.9 4.9 14.2 14.2" />
                      <path d="M9 9h.01" />
                      <path d="M15 15h.01" />
                    </svg>
                    {mode === "generate" ? "Wygeneruj" : "Modyfikuj"}
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {recipeToDisplay && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <h3 className="mb-2 text-lg font-bold">{recipeToDisplay.title}</h3>
                  <div className="prose max-h-96 overflow-y-auto dark:prose-invert">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: recipeToDisplay.content
                          .split("\n")
                          .map((line: string) => {
                            if (line.startsWith("# ")) return `<h1>${line.substring(2)}</h1>`;
                            if (line.startsWith("## ")) return `<h2>${line.substring(3)}</h2>`;
                            if (line.startsWith("- ")) return `<li>${line.substring(2)}</li>`;
                            if (line.match(/^\d+\. /)) return `<li>${line.substring(line.indexOf(" ") + 1)}</li>`;
                            return line ? `<p>${line}</p>` : "<br/>";
                          })
                          .join(""),
                      }}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("input")}>
                    Wróć do edycji
                  </Button>
                  <Button onClick={handleSave} disabled={isSaveLoading} className="gap-2">
                    {isSaveLoading ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Zapisywanie...
                      </>
                    ) : (
                      "Zapisz przepis"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            {error.message}
          </div>
        )}
      </div>
    </div>
  );
}
