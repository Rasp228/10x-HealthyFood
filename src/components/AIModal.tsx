import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { RecipeDto, GenerateRecipeCommand, ModifyRecipeCommand, SaveRecipeCommand } from "../types";
import { useAI } from "../hooks/useAI";
import { useToast } from "../hooks/useToast";

interface AIModalFormValues {
  additional_params: string;
  base_recipe?: string;
  temp_title?: string;
  temp_content?: string;
  replace_original?: boolean;
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
    base_recipe: "",
    temp_title: "",
    temp_content: "",
    replace_original: false,
  });
  const [step, setStep] = useState<"input" | "preview">("input");
  const [showBaseRecipe, setShowBaseRecipe] = useState(false);
  const [editingOriginal, setEditingOriginal] = useState(false);

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
      setShowBaseRecipe(false);
      setEditingOriginal(false);
      setFormValues({
        additional_params: "",
        base_recipe: "",
        temp_title: "",
        temp_content: "",
        replace_original: false,
      });
    } else if (isOpen && originalRecipe) {
      // Jeśli otwieramy modal z przepisem do modyfikacji, ustawiamy pola tymczasowej edycji
      setFormValues({
        additional_params: "",
        base_recipe: "",
        temp_title: originalRecipe.title,
        temp_content: originalRecipe.content,
        replace_original: false,
      });
    }
  }, [isOpen, originalRecipe, resetAIState]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormValues((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Obsługa operacji AI
  const handleAIOperation = async () => {
    try {
      if (mode === "generate") {
        const params: GenerateRecipeCommand = {
          additional_params: formValues.additional_params,
          base_recipe: showBaseRecipe && formValues.base_recipe ? formValues.base_recipe : undefined,
        };
        await generateRecipe(params);
      } else if (mode === "modify" && originalRecipe) {
        // Jeśli przepis był tymczasowo edytowany, używamy tej wersji
        const modifiedOriginalRecipe = editingOriginal
          ? {
              ...originalRecipe,
              title: formValues.temp_title || originalRecipe.title,
              content: formValues.temp_content || originalRecipe.content,
            }
          : originalRecipe;

        const params: ModifyRecipeCommand = {
          additional_params: formValues.additional_params,
          base_recipe: JSON.stringify(modifiedOriginalRecipe),
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
        is_new: !(mode === "modify" && originalRecipe && formValues.replace_original),
        replace_existing:
          mode === "modify" && originalRecipe && formValues.replace_original
            ? {
                recipe_id: originalRecipe.id,
                replace: true,
              }
            : undefined,
      };

      const savedRecipe = await saveAIRecipe(saveParams);

      if (savedRecipe) {
        const actionText = saveParams.is_new ? "został zapisany" : "został zaktualizowany";
        showToast(`Przepis "${savedRecipe.title}" ${actionText}.`, "success");

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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
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
            {/* Tryb modyfikacji przepisu */}
            {mode === "modify" && originalRecipe && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">Modyfikujesz przepis: {originalRecipe.title}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingOriginal(!editingOriginal)}
                    className="text-xs"
                  >
                    {editingOriginal ? "Anuluj edycję" : "Edytuj przed wysłaniem do AI"}
                  </Button>
                </div>

                {editingOriginal ? (
                  <div className="space-y-2">
                    <div>
                      <label htmlFor="temp_title" className="block text-sm font-medium">
                        Tytuł
                      </label>
                      <input
                        type="text"
                        id="temp_title"
                        name="temp_title"
                        value={formValues.temp_title}
                        onChange={handleChange}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="temp_content" className="block text-sm font-medium">
                        Treść przepisu
                      </label>
                      <textarea
                        id="temp_content"
                        name="temp_content"
                        value={formValues.temp_content}
                        onChange={handleChange}
                        className="h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={10}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ta edycja jest tymczasowa i zostanie użyta tylko do wygenerowania nowej wersji przez AI.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-32 overflow-y-auto rounded bg-background/50 p-2 text-sm">
                    <p className="font-medium">{originalRecipe.title}</p>
                    <p className="line-clamp-3 text-muted-foreground">
                      {originalRecipe.content.substring(0, 200)}
                      {originalRecipe.content.length > 200 ? "..." : ""}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Opcjonalny przepis bazowy (tylko dla trybu generowania) */}
            {mode === "generate" && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show_base_recipe"
                    checked={showBaseRecipe}
                    onChange={(e) => setShowBaseRecipe(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="show_base_recipe" className="text-sm font-medium">
                    Chcę podać przepis bazowy do inspiracji dla AI
                  </label>
                </div>

                {showBaseRecipe && (
                  <div className="rounded-lg border p-3">
                    <label htmlFor="base_recipe" className="block text-sm font-medium">
                      Przepis bazowy (opcjonalnie)
                    </label>
                    <textarea
                      id="base_recipe"
                      name="base_recipe"
                      value={formValues.base_recipe}
                      onChange={handleChange}
                      className="mt-1 h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder="Wklej tutaj przepis, który posłuży jako inspiracja dla AI..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* Dodatkowe parametry - wspólne dla obu trybów */}
            <div className="space-y-2">
              <label htmlFor="additional_params" className="block text-sm font-medium">
                Dodatkowe parametry (opcjonalnie)
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
              {mode === "generate" && (
                <div className="mt-2 rounded-lg bg-purple-50 p-3 dark:bg-purple-950">
                  <p className="text-xs text-purple-700 dark:text-purple-300">
                    <span className="font-medium">Wskazówka:</span> Jeśli wszystkie pola pozostawisz puste, zostanie
                    wygenerowany losowy przepis uwzględniający Twoje preferencje z profilu użytkownika.
                  </p>
                </div>
              )}
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

                {/* Opcja zastąpienia oryginalnego przepisu (tylko w trybie modyfikacji) */}
                {mode === "modify" && originalRecipe && (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        id="replace_original"
                        name="replace_original"
                        checked={formValues.replace_original || false}
                        onChange={handleChange}
                        className="mt-1 h-4 w-4 rounded border-gray-300"
                      />
                      <div className="flex-1">
                        <label htmlFor="replace_original" className="text-sm font-medium">
                          Zastąp oryginalny przepis &quot;{originalRecipe.title}&quot;
                        </label>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Jeśli zaznaczysz tę opcję, oryginalny przepis zostanie zaktualizowany nową wersją AI. W
                          przeciwnym razie zostanie utworzony nowy przepis.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

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
