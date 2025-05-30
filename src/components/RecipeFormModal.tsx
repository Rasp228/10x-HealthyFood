import React, { useState, useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { RecipeDto, CreateRecipeCommand, UpdateRecipeCommand } from "../types";
import { useRecipeMutations } from "../hooks/useRecipeMutations";

// Schemat walidacji Zod
const recipeSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany").max(100, "Tytuł nie może przekraczać 100 znaków"),
  content: z
    .string()
    .min(1, "Treść przepisu jest wymagana")
    .max(5000, "Treść przepisu nie może przekraczać 5000 znaków"),
  additional_params: z
    .string()
    .max(5000, "Dodatkowe parametry nie mogą przekraczać 5000 znaków")
    .optional()
    .nullable()
    .transform((val) => (val === "" ? null : val)),
  is_ai_generated: z.boolean().optional().default(false),
});

interface RecipeFormValues {
  title: string;
  content: string;
  additional_params?: string;
  is_ai_generated?: boolean;
}

interface RecipeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe?: RecipeDto; // Jeśli przekazano, tryb edycji; w przeciwnym razie tryb dodawania
  onSuccess?: () => void;
}

export default function RecipeFormModal({ isOpen, onClose, recipe, onSuccess }: RecipeFormModalProps) {
  const [formValues, setFormValues] = useState<RecipeFormValues>({
    title: "",
    content: "",
    additional_params: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { createRecipe, updateRecipe, createStatus, updateStatus, createError, updateError } = useRecipeMutations();

  const isLoading = createStatus === "loading" || updateStatus === "loading";
  const isEditMode = !!recipe;

  // Przy otwarciu modalu w trybie edycji, ustawiamy wartości formularza
  useEffect(() => {
    if (recipe) {
      setFormValues({
        title: recipe.title,
        content: recipe.content,
        additional_params: recipe.additional_params || "",
      });
    } else {
      // Resetujemy formularz przy otwieraniu w trybie dodawania
      setFormValues({
        title: "",
        content: "",
        additional_params: "",
      });
    }
    setErrors({});
  }, [recipe, isOpen]);

  // Walidacja formularza z użyciem Zod
  const validate = (): boolean => {
    try {
      recipeSchema.parse(formValues);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0].toString()] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  // Walidacja pojedynczego pola (dla walidacji w czasie rzeczywistym)
  const validateField = (name: keyof RecipeFormValues, value: string): string | null => {
    try {
      const fieldSchema = recipeSchema.shape[name];
      fieldSchema.parse(value);
      return null;
    } catch (error) {
      if (error instanceof z.ZodError && error.errors.length > 0) {
        return error.errors[0].message;
      }
      return null;
    }
  };

  // Rozszerzona obsługa zmian pól formularza z walidacją w czasie rzeczywistym
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));

    // Walidacja w czasie rzeczywistym tylko dla pól, które zostały już dotknięte
    if (errors[name]) {
      const fieldError = validateField(name as keyof RecipeFormValues, value);
      if (fieldError) {
        setErrors((prev) => ({ ...prev, [name]: fieldError }));
      } else {
        setErrors((prev) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [name]: removed, ...rest } = prev;
          return rest;
        });
      }
    }
  };

  // Obsługa zatwierdzenia formularza
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      if (isEditMode && recipe) {
        // Tryb edycji
        const updateData: UpdateRecipeCommand = {
          title: formValues.title,
          content: formValues.content,
          additional_params: formValues.additional_params || null,
        };

        await updateRecipe(recipe.id, updateData);
      } else {
        // Tryb dodawania
        const createData: CreateRecipeCommand = {
          title: formValues.title,
          content: formValues.content,
          additional_params: formValues.additional_params || null,
        };

        await createRecipe(createData);
      }

      // Sukces - zamykamy modal i wywołujemy callback
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      // Błąd już jest ustawiony w state poprzez hook useRecipeMutations
      console.error("Błąd podczas zapisywania przepisu:", err);
    }
  };

  // Obsługa błędów API
  useEffect(() => {
    const error = createError || updateError;
    if (error) {
      setErrors((prev) => ({
        ...prev,
        form: error.message || "Wystąpił błąd podczas zapisywania przepisu",
      }));
    }
  }, [createError, updateError]);

  // Jeśli modal nie jest otwarty, nie renderujemy zawartości
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-lg">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">{isEditMode ? "Edytuj przepis" : "Dodaj nowy przepis"}</h2>
          <button
            onClick={onClose}
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

        {errors.form && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {errors.form}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium">
              Tytuł przepisu*
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formValues.title}
              onChange={handleChange}
              onBlur={() => {
                const error = validateField("title", formValues.title);
                if (error) {
                  setErrors((prev) => ({ ...prev, title: error }));
                }
              }}
              className={`w-full rounded-md border p-2 ${errors.title ? "border-red-300" : "border-input"}`}
              placeholder="Wprowadź tytuł przepisu"
              disabled={isLoading}
              required
              maxLength={100}
              aria-required="true"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
            {errors.title && (
              <p className="text-xs text-red-500" id="title-error">
                {errors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="content" className="text-sm font-medium">
              Treść przepisu*
            </label>
            <textarea
              id="content"
              name="content"
              value={formValues.content}
              onChange={handleChange}
              onBlur={() => {
                const error = validateField("content", formValues.content);
                if (error) {
                  setErrors((prev) => ({ ...prev, content: error }));
                }
              }}
              rows={10}
              className={`w-full rounded-md border p-2 ${errors.content ? "border-red-300" : "border-input"}`}
              placeholder="Wprowadź treść przepisu (możesz używać składni Markdown)"
              disabled={isLoading}
              required
              maxLength={5000}
              aria-required="true"
              aria-invalid={!!errors.content}
              aria-describedby={errors.content ? "content-error" : undefined}
            />
            {errors.content && (
              <p className="text-xs text-red-500" id="content-error">
                {errors.content}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Możesz używać składni Markdown do formatowania treści. Maksymalna długość: 5000 znaków.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="additional_params" className="text-sm font-medium">
              Dodatkowe parametry (opcjonalnie)
            </label>
            <input
              type="text"
              id="additional_params"
              name="additional_params"
              value={formValues.additional_params}
              onChange={handleChange}
              onBlur={() => {
                const error = validateField("additional_params", formValues.additional_params || "");
                if (error) {
                  setErrors((prev) => ({ ...prev, additional_params: error }));
                }
              }}
              className={`w-full rounded-md border p-2 ${errors.additional_params ? "border-red-300" : "border-input"}`}
              placeholder="np. wegetariański, bezglutenowy (oddzielone przecinkami)"
              disabled={isLoading}
              maxLength={5000}
              aria-invalid={!!errors.additional_params}
              aria-describedby={errors.additional_params ? "params-error" : undefined}
            />
            {errors.additional_params && (
              <p className="text-xs text-red-500" id="params-error">
                {errors.additional_params}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Maksymalna długość: 5000 znaków.</p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Anuluj
            </Button>
            <Button type="submit" disabled={isLoading}>
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
              ) : isEditMode ? (
                "Zapisz zmiany"
              ) : (
                "Dodaj przepis"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
