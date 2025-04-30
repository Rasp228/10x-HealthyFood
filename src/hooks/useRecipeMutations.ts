import { useState } from "react";
import type { RecipeDto, CreateRecipeCommand, UpdateRecipeCommand } from "../types";

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
    reset: () => setCreateState({ data: null, status: "idle", error: null, reset }),
  });

  const [updateState, setUpdateState] = useState<MutationResult<RecipeDto>>({
    data: null,
    status: "idle",
    error: null,
    reset: () => setUpdateState({ data: null, status: "idle", error: null, reset }),
  });

  const [deleteState, setDeleteState] = useState<MutationResult<boolean>>({
    data: null,
    status: "idle",
    error: null,
    reset: () => setDeleteState({ data: null, status: "idle", error: null, reset }),
  });

  // Funkcja do tworzenia nowego przepisu
  const createRecipe = async (recipe: CreateRecipeCommand): Promise<RecipeDto> => {
    setCreateState({ ...createState, status: "loading", error: null });

    try {
      // Tu będzie rzeczywiste wywołanie API
      // const response = await fetch("/api/recipes", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(recipe)
      // });
      //
      // if (!response.ok) {
      //   throw new Error(`Błąd podczas tworzenia przepisu (${response.status})`);
      // }
      //
      // const data = await response.json();

      // Mockowanie odpowiedzi
      await new Promise((resolve) => setTimeout(resolve, 800));

      const mockResponse: RecipeDto = {
        id: Math.floor(Math.random() * 1000) + 100,
        title: recipe.title,
        content: recipe.content,
        additional_params: recipe.additional_params || null,
        user_id: "123",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ai_generated: false,
        original_recipe_id: null,
      };

      setCreateState({
        ...createState,
        data: mockResponse,
        status: "success",
      });

      return mockResponse;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas tworzenia przepisu");
      setCreateState({
        ...createState,
        status: "error",
        error,
      });
      throw error;
    }
  };

  // Funkcja do aktualizacji przepisu
  const updateRecipe = async (id: number, recipe: UpdateRecipeCommand): Promise<RecipeDto> => {
    setUpdateState({ ...updateState, status: "loading", error: null });

    try {
      // Tu będzie rzeczywiste wywołanie API
      // const response = await fetch(`/api/recipes/${id}`, {
      //   method: "PUT",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(recipe)
      // });
      //
      // if (!response.ok) {
      //   throw new Error(`Błąd podczas aktualizacji przepisu (${response.status})`);
      // }
      //
      // const data = await response.json();

      // Mockowanie odpowiedzi
      await new Promise((resolve) => setTimeout(resolve, 700));

      const mockResponse: RecipeDto = {
        id,
        title: recipe.title,
        content: recipe.content,
        additional_params: recipe.additional_params || null,
        user_id: "123",
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        ai_generated: false,
        original_recipe_id: null,
      };

      setUpdateState({
        ...updateState,
        data: mockResponse,
        status: "success",
      });

      return mockResponse;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas aktualizacji przepisu");
      setUpdateState({
        ...updateState,
        status: "error",
        error,
      });
      throw error;
    }
  };

  // Funkcja do usuwania przepisu
  const deleteRecipe = async (id: number): Promise<boolean> => {
    setDeleteState({ ...deleteState, status: "loading", error: null });

    try {
      // Tu będzie rzeczywiste wywołanie API
      // const response = await fetch(`/api/recipes/${id}`, {
      //   method: "DELETE"
      // });
      //
      // if (!response.ok) {
      //   throw new Error(`Błąd podczas usuwania przepisu (${response.status})`);
      // }
      //
      // const data = await response.json();

      // Mockowanie odpowiedzi
      await new Promise((resolve) => setTimeout(resolve, 500));

      setDeleteState({
        ...deleteState,
        data: true,
        status: "success",
      });

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Nieznany błąd podczas usuwania przepisu");
      setDeleteState({
        ...deleteState,
        status: "error",
        error,
      });
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
