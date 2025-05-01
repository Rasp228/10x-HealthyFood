import { useState } from "react";
import type {
  GenerateRecipeCommand,
  ModifyRecipeCommand,
  GeneratedRecipeDto,
  ModifiedRecipeDto,
  SaveRecipeCommand,
  RecipeDto,
} from "../types";

interface UseAIState {
  isGenerating: boolean;
  isModifying: boolean;
  isSaving: boolean;
  generatedRecipe: GeneratedRecipeDto | null;
  modifiedRecipe: ModifiedRecipeDto | null;
  savedRecipe: RecipeDto | null;
  error: Error | null;
}

interface UseAIActions {
  generateRecipe: (params: GenerateRecipeCommand) => Promise<GeneratedRecipeDto | null>;
  modifyRecipe: (id: number, params: ModifyRecipeCommand) => Promise<ModifiedRecipeDto | null>;
  saveAIRecipe: (params: SaveRecipeCommand) => Promise<RecipeDto | null>;
  resetAIState: () => void;
}

export function useAI(): UseAIState & UseAIActions {
  const [state, setState] = useState<UseAIState>({
    isGenerating: false,
    isModifying: false,
    isSaving: false,
    generatedRecipe: null,
    modifiedRecipe: null,
    savedRecipe: null,
    error: null,
  });

  const resetAIState = () => {
    setState({
      isGenerating: false,
      isModifying: false,
      isSaving: false,
      generatedRecipe: null,
      modifiedRecipe: null,
      savedRecipe: null,
      error: null,
    });
  };

  const generateRecipe = async (params: GenerateRecipeCommand): Promise<GeneratedRecipeDto | null> => {
    setState((prev) => ({
      ...prev,
      isGenerating: true,
      error: null,
      generatedRecipe: null,
    }));

    try {
      const response = await fetch("/api/ai/generate-recipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Błąd generowania przepisu: ${response.status}`);
      }

      const generatedRecipe = (await response.json()) as GeneratedRecipeDto;

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generatedRecipe,
      }));

      return generatedRecipe;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas generowania przepisu");
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  };

  const modifyRecipe = async (id: number, params: ModifyRecipeCommand): Promise<ModifiedRecipeDto | null> => {
    setState((prev) => ({
      ...prev,
      isModifying: true,
      error: null,
      modifiedRecipe: null,
    }));

    try {
      const response = await fetch(`/api/ai/modify-recipe/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Błąd modyfikacji przepisu: ${response.status}`);
      }

      const modifiedRecipe = (await response.json()) as ModifiedRecipeDto;

      setState((prev) => ({
        ...prev,
        isModifying: false,
        modifiedRecipe,
      }));

      return modifiedRecipe;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas modyfikacji przepisu");
      setState((prev) => ({
        ...prev,
        isModifying: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  };

  const saveAIRecipe = async (params: SaveRecipeCommand): Promise<RecipeDto | null> => {
    setState((prev) => ({
      ...prev,
      isSaving: true,
      error: null,
      savedRecipe: null,
    }));

    try {
      const response = await fetch("/api/ai/save-recipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Błąd zapisywania przepisu AI: ${response.status}`);
      }

      const savedRecipe = (await response.json()) as RecipeDto;

      setState((prev) => ({
        ...prev,
        isSaving: false,
        savedRecipe,
      }));

      return savedRecipe;
    } catch (error) {
      const thrownError = error instanceof Error ? error : new Error("Nieznany błąd podczas zapisywania przepisu AI");
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: thrownError,
      }));

      throw thrownError;
    }
  };

  return {
    ...state,
    generateRecipe,
    modifyRecipe,
    saveAIRecipe,
    resetAIState,
  };
}
