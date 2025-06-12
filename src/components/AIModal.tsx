import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import BaseModal from "@/components/ui/BaseModal";
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

interface ValidationErrors {
  additional_params?: string;
  base_recipe?: string;
  temp_title?: string;
  temp_content?: string;
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
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const {
    generateRecipe,
    modifyRecipe,
    saveAIRecipe,
    resetAIState,
    retryLastOperation,
    cancelOperation,
    isGenerating,
    isModifying,
    isSaving,
    generatedRecipe,
    modifiedRecipe,
    error,
    retryable,
    canCancel,
  } = useAI();

  const { showToast } = useToast();

  // Walidacja pól na żywo
  const validateField = (name: string, value: string): string | undefined => {
    switch (name) {
      case "additional_params":
        if (value.length > 5000) {
          return "Dodatkowe parametry nie mogą przekraczać 5000 znaków";
        }
        break;
      case "base_recipe":
        if (value.length > 5000) {
          return "Przepis bazowy nie może przekraczać 5000 znaków";
        }
        break;
      case "temp_title":
        if (value.length > 100) {
          return "Tytuł nie może przekraczać 100 znaków";
        }
        break;
      case "temp_content":
        if (value.length > 5000) {
          return "Treść przepisu nie może przekraczać 5000 znaków";
        }
        break;
    }
    return undefined;
  };

  // Walidacja wszystkich pól
  const validateForm = (): boolean => {
    const errors: ValidationErrors = {};

    errors.additional_params = validateField("additional_params", formValues.additional_params);
    if (showBaseRecipe && formValues.base_recipe) {
      errors.base_recipe = validateField("base_recipe", formValues.base_recipe);
    }
    if (editingOriginal && formValues.temp_title) {
      errors.temp_title = validateField("temp_title", formValues.temp_title);
    }
    if (editingOriginal && formValues.temp_content) {
      errors.temp_content = validateField("temp_content", formValues.temp_content);
    }

    // Usuń błędy undefined
    const filteredErrors: ValidationErrors = {};
    (Object.keys(errors) as (keyof ValidationErrors)[]).forEach((key) => {
      if (errors[key]) {
        filteredErrors[key] = errors[key];
      }
    });

    setValidationErrors(filteredErrors);
    return Object.keys(filteredErrors).length === 0;
  };

  // Reset stanu przy zamykaniu/otwieraniu modala
  useEffect(() => {
    if (!isOpen) {
      setStep("input");
      resetAIState();
      setShowBaseRecipe(false);
      setEditingOriginal(false);
      setValidationErrors({});
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

    const newValue = type === "checkbox" ? checked : value;

    setFormValues((prev) => ({
      ...prev,
      [name]: newValue,
    }));

    // Live validation
    if (type !== "checkbox") {
      const error = validateField(name, value);
      setValidationErrors((prev) => ({
        ...prev,
        [name]: error,
      }));
    }
  };

  // Obsługa operacji AI
  const handleAIOperation = async () => {
    if (!validateForm()) {
      showToast("Popraw błędy w formularzu przed kontynuowaniem", "error");
      return;
    }

    try {
      if (mode === "generate") {
        const params: GenerateRecipeCommand = {
          additional_params: formValues.additional_params || null,
          base_recipe: showBaseRecipe && formValues.base_recipe ? formValues.base_recipe : null,
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
          additional_params: formValues.additional_params || null,
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

  // Obsługa retry
  const handleRetry = async () => {
    try {
      await retryLastOperation();
      setStep("preview");
    } catch (err) {
      if (err instanceof Error) {
        showToast(err.message, "error");
      }
    }
  };

  // Obsługa anulowania
  const handleCancel = () => {
    cancelOperation();
    showToast("Operacja została anulowana", "info");
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
  const hasValidationErrors = Object.keys(validationErrors).some(
    (key) => validationErrors[key as keyof ValidationErrors]
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "generate" ? "Wygeneruj przepis z AI" : "Modyfikuj przepis z AI"}
      maxWidth="3xl"
      zIndex={60}
    >
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
            <div className="relative">
              <textarea
                id="additional_params"
                name="additional_params"
                value={formValues.additional_params}
                onChange={handleChange}
                className={`h-40 w-full rounded-md border px-3 py-2 text-sm ${
                  validationErrors.additional_params
                    ? "border-destructive bg-destructive/10"
                    : "border-input bg-background"
                }`}
                placeholder={
                  mode === "generate"
                    ? "Dodaj szczegóły, preferencje, ograniczenia itp. np. 'wegetariańskie, bez glutenu, danie na szybki obiad'"
                    : "Opisz, jak chcesz zmodyfikować przepis, np. 'dodaj więcej warzyw, zmniejsz kaloryczność, dostosuj do diety keto'"
                }
              />
              <div className="mt-1 flex justify-between text-xs">
                <span className={validationErrors.additional_params ? "text-destructive" : "text-muted-foreground"}>
                  {validationErrors.additional_params ||
                    "Im więcej szczegółów podasz, tym lepiej AI dostosuje przepis do Twoich potrzeb."}
                </span>
                <span
                  className={`${formValues.additional_params.length > 5000 ? "text-destructive" : formValues.additional_params.length > 4500 ? "text-orange-500" : "text-muted-foreground"}`}
                >
                  {formValues.additional_params.length}/5000
                </span>
              </div>
            </div>
            {mode === "generate" && (
              <div className="mt-2 rounded-lg bg-purple-50 p-3 dark:bg-purple-950">
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  <span className="font-medium">Wskazówka:</span>
                  {showBaseRecipe
                    ? " Gdy podajesz przepis bazowy, AI zmodyfikuje go zgodnie z Twoimi preferencjami i dodatkowymi instrukcjami."
                    : " Jeśli wszystkie pola pozostawisz puste, zostanie wygenerowany losowy przepis uwzględniający Twoje preferencje z profilu użytkownika."}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            {canCancel && isLoading && (
              <Button variant="destructive" onClick={handleCancel}>
                Przerwij operację
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleAIOperation}
              disabled={isLoading || hasValidationErrors}
              className="gap-2 text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  {mode === "generate" ? "Generowanie..." : "Modyfikowanie..."}
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
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                  {mode === "generate" ? "Wygeneruj" : "Modyfikuj"}
                </>
              )}
            </Button>
          </div>

          {/* Progress indicator podczas operacji AI */}
          {isLoading && (
            <div className="mt-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-950">
              <div className="flex items-center space-x-3">
                <LoadingSpinner size="sm" className="text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {mode === "generate" ? "AI generuje przepis..." : "AI modyfikuje przepis..."}
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    To może potrwać do 60 sekund. AI uwzględnia Twoje preferencje i tworzy spersonalizowany przepis.
                  </p>
                </div>
                {canCancel && (
                  <Button variant="outline" size="sm" onClick={handleCancel} className="text-xs">
                    Anuluj
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {recipeToDisplay && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 text-lg font-bold">{recipeToDisplay.title}</h3>
                <div className="prose max-h-96 overflow-y-auto dark:prose-invert">
                  <div
                    className="whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: recipeToDisplay.content
                        .split("\n")
                        .map((line: string) => {
                          const trimmedLine = line.trim();

                          // Obsługa nagłówków markdown
                          if (trimmedLine.startsWith("### ")) return `<h3>${trimmedLine.substring(4)}</h3>`;
                          if (trimmedLine.startsWith("## ")) return `<h2>${trimmedLine.substring(3)}</h2>`;
                          if (trimmedLine.startsWith("# ")) return `<h1>${trimmedLine.substring(2)}</h1>`;

                          // Obsługa list
                          if (trimmedLine.startsWith("- ") || trimmedLine.startsWith("* ")) {
                            return `<li>${trimmedLine.substring(2)}</li>`;
                          }
                          if (trimmedLine.match(/^\d+\.\s/)) {
                            return `<li>${trimmedLine.substring(trimmedLine.indexOf(" ") + 1)}</li>`;
                          }

                          // Obsługa pogrubienia
                          let processedLine = trimmedLine.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
                          processedLine = processedLine.replace(/\*(.*?)\*/g, "<em>$1</em>");

                          // Puste linie jako break
                          if (!trimmedLine) return "<br/>";

                          // Zwykłe linie jako paragrafy
                          return `<p>${processedLine}</p>`;
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
                      <LoadingSpinner size="sm" />
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
        <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-3">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-destructive font-medium">Wystąpił błąd</p>
              <p className="text-sm text-destructive">{error.message}</p>
            </div>
            {retryable && (
              <Button variant="outline" size="sm" onClick={handleRetry} className="ml-2">
                Spróbuj ponownie
              </Button>
            )}
          </div>
        </div>
      )}
    </BaseModal>
  );
}
