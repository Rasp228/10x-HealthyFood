import React, { useState, useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import BaseModal from "@/components/ui/BaseModal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Edytuj przepis" : "Dodaj nowy przepis"}
      maxWidth="2xl"
      zIndex={60}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Wyświetlenie błędów formularza */}
        {errors.form && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{errors.form}</p>
          </div>
        )}

        {/* Tytuł przepisu */}
        <div className="space-y-2">
          <label htmlFor="title" className="block text-sm font-medium">
            Tytuł przepisu <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formValues.title}
            onChange={handleChange}
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              errors.title ? "border-destructive bg-destructive/10" : "border-input bg-background"
            }`}
            placeholder="Np. Spaghetti Carbonara"
            required
            disabled={isLoading}
            maxLength={100}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          <p className="text-xs text-muted-foreground">{formValues.title.length}/100</p>
        </div>

        {/* Treść przepisu */}
        <div className="space-y-2">
          <label htmlFor="content" className="block text-sm font-medium">
            Treść przepisu <span className="text-destructive">*</span>
          </label>
          <textarea
            id="content"
            name="content"
            value={formValues.content}
            onChange={handleChange}
            className={`h-64 w-full rounded-md border px-3 py-2 text-sm ${
              errors.content ? "border-destructive bg-destructive/10" : "border-input bg-background"
            }`}
            placeholder="Składniki:&#10;- Makaron spaghetti 400g&#10;- Jajka 3 szt.&#10;&#10;Przygotowanie:&#10;1. Ugotuj makaron..."
            required
            disabled={isLoading}
            maxLength={5000}
          />
          {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
          <p className="text-xs text-muted-foreground">{formValues.content.length}/5000</p>
        </div>

        {/* Dodatkowe parametry */}
        <div className="space-y-2">
          <label htmlFor="additional_params" className="block text-sm font-medium">
            Dodatkowe parametry (opcjonalnie)
          </label>
          <input
            type="text"
            id="additional_params"
            name="additional_params"
            value={formValues.additional_params || ""}
            onChange={handleChange}
            className={`w-full rounded-md border px-3 py-2 text-sm ${
              errors.additional_params ? "border-destructive bg-destructive/10" : "border-input bg-background"
            }`}
            placeholder="Np. wegetariański, bezglutenowy, danie główne"
            disabled={isLoading}
            maxLength={5000}
          />
          {errors.additional_params && <p className="text-xs text-destructive">{errors.additional_params}</p>}
          <p className="text-xs text-muted-foreground">
            Tagi lub parametry ułatwiające wyszukiwanie i kategoryzację przepisu
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Anuluj
          </Button>
          <Button type="submit" disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <LoadingSpinner size="sm" />
                {isEditMode ? "Zapisywanie..." : "Dodawanie..."}
              </>
            ) : isEditMode ? (
              "Zapisz zmiany"
            ) : (
              "Dodaj przepis"
            )}
          </Button>
        </div>
      </form>
    </BaseModal>
  );
}
