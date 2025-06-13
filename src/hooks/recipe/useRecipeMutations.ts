import { useState } from "react";
import type { RecipeDto, CreateRecipeCommand, UpdateRecipeCommand } from "../../types";
import { RecipeService } from "../../lib/services/recipe.service";

type MutationStatus = "idle" | "loading" | "success" | "error";

interface MutationResult<T> {
  data: T | null;
  status: MutationStatus;
  error: Error | null;
  reset: () => void;
}

interface RecipeMutations {
  createRecipe: (recipe: CreateRecipeCommand) => Promise<RecipeDto>;
  updateRecipe: (id: number, recipe: UpdateRecipeCommand) => Promise<RecipeDto>;
  deleteRecipe: (id: number) => Promise<boolean>;
  createStatus: MutationStatus;
  updateStatus: MutationStatus;
  deleteStatus: MutationStatus;
  createError: Error | null;
  updateError: Error | null;
  deleteError: Error | null;
  resetState: () => void;
}

// Hook do operacji CRUD na przepisach
export function useRecipeMutations(): RecipeMutations {
  const [createState, setCreateState] = useState<MutationResult<RecipeDto>>({
    data: null,
    status: "idle",
    error: null,
    reset: () => {
      setCreateState((prev) => ({ ...prev, data: null, status: "idle", error: null }));
    },
  });

  const [updateState, setUpdateState] = useState<MutationResult<RecipeDto>>({
    data: null,
    status: "idle",
    error: null,
    reset: () => {
      setUpdateState((prev) => ({ ...prev, data: null, status: "idle", error: null }));
    },
  });

  const [deleteState, setDeleteState] = useState<MutationResult<boolean>>({
    data: null,
    status: "idle",
    error: null,
    reset: () => {
      setDeleteState((prev) => ({ ...prev, data: null, status: "idle", error: null }));
    },
  });

  // Funkcja do tworzenia nowego przepisu
  const createRecipe = async (recipe: CreateRecipeCommand): Promise<RecipeDto> => {
    setCreateState((prev) => ({ ...prev, status: "loading", error: null }));

    try {
      const recipeService = new RecipeService();

      // Używamy rzeczywistego API zamiast mockowanych danych
      const data = await recipeService.createRecipe("current-user", recipe);

      setCreateState((prev) => ({
        ...prev,
        data,
        status: "success",
      }));

      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas tworzenia przepisu");
      setCreateState((prev) => ({
        ...prev,
        status: "error",
        error,
      }));
      throw error;
    }
  };

  // Funkcja do aktualizacji przepisu
  const updateRecipe = async (id: number, recipe: UpdateRecipeCommand): Promise<RecipeDto> => {
    setUpdateState((prev) => ({ ...prev, status: "loading", error: null }));

    try {
      const recipeService = new RecipeService();

      // Używamy rzeczywistego API zamiast mockowanych danych
      const data = await recipeService.updateRecipe(id, "current-user", recipe);

      if (!data) {
        throw new Error("Przepis nie został znaleziony");
      }

      setUpdateState((prev) => ({
        ...prev,
        data,
        status: "success",
      }));

      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas aktualizacji przepisu");
      setUpdateState((prev) => ({
        ...prev,
        status: "error",
        error,
      }));
      throw error;
    }
  };

  // Funkcja do usuwania przepisu
  const deleteRecipe = async (id: number): Promise<boolean> => {
    setDeleteState((prev) => ({ ...prev, status: "loading", error: null }));

    try {
      const recipeService = new RecipeService();

      // Używamy rzeczywistego API zamiast mockowanych danych
      const result = await recipeService.deleteRecipe(id, "current-user");

      setDeleteState((prev) => ({
        ...prev,
        data: result,
        status: "success",
      }));

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas usuwania przepisu");
      setDeleteState((prev) => ({
        ...prev,
        status: "error",
        error,
      }));
      throw error;
    }
  };

  // Resetowanie wszystkich stanów
  const resetState = () => {
    createState.reset();
    updateState.reset();
    deleteState.reset();
  };

  return {
    createRecipe,
    updateRecipe,
    deleteRecipe,
    createStatus: createState.status,
    updateStatus: updateState.status,
    deleteStatus: deleteState.status,
    createError: createState.error,
    updateError: updateState.error,
    deleteError: deleteState.error,
    resetState,
  };
}
