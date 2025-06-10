import { useState, useCallback, useRef } from "react";
import type {
  GenerateRecipeCommand,
  ModifyRecipeCommand,
  GeneratedRecipeDto,
  ModifiedRecipeDto,
  SaveRecipeCommand,
  RecipeDto,
  AIErrorResponse,
} from "../types";

interface UseAIState {
  isGenerating: boolean;
  isModifying: boolean;
  isSaving: boolean;
  generatedRecipe: GeneratedRecipeDto | null;
  modifiedRecipe: ModifiedRecipeDto | null;
  savedRecipe: RecipeDto | null;
  error: Error | null;
  retryable: boolean;
  canCancel: boolean;
}

interface UseAIActions {
  generateRecipe: (params: GenerateRecipeCommand) => Promise<GeneratedRecipeDto | null>;
  modifyRecipe: (id: number, params: ModifyRecipeCommand) => Promise<ModifiedRecipeDto | null>;
  saveAIRecipe: (params: SaveRecipeCommand) => Promise<RecipeDto | null>;
  resetAIState: () => void;
  retryLastOperation: () => Promise<GeneratedRecipeDto | ModifiedRecipeDto | RecipeDto | null>;
  cancelOperation: () => void;
}

// Timeout w milisekundach (60 sekund)
const AI_TIMEOUT = 60000;

// Maksymalna liczba prób retry
const MAX_RETRY_ATTEMPTS = 2;

// Eksponencjalny backoff - opóźnienia między próbami
const RETRY_DELAYS = [1000, 4000]; // 1s, 4s

export function useAI(): UseAIState & UseAIActions {
  const [state, setState] = useState<UseAIState>({
    isGenerating: false,
    isModifying: false,
    isSaving: false,
    generatedRecipe: null,
    modifiedRecipe: null,
    savedRecipe: null,
    error: null,
    retryable: false,
    canCancel: false,
  });

  // Ref do przechowywania ostatniej operacji dla retry
  const lastOperationRef = useRef<{
    type: "generate" | "modify" | "save";
    params: GenerateRecipeCommand | ModifyRecipeCommand | SaveRecipeCommand;
    id?: number;
  } | null>(null);

  // Ref do kontrolowania AbortController
  const abortControllerRef = useRef<AbortController | null>(null);

  const resetAIState = useCallback(() => {
    // Anuluj aktywną operację jeśli istnieje
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState({
      isGenerating: false,
      isModifying: false,
      isSaving: false,
      generatedRecipe: null,
      modifiedRecipe: null,
      savedRecipe: null,
      error: null,
      retryable: false,
      canCancel: false,
    });

    lastOperationRef.current = null;
  }, []);

  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isGenerating: false,
      isModifying: false,
      isSaving: false,
      canCancel: false,
      error: new Error("Operacja została anulowana przez użytkownika"),
    }));
  }, []);

  const handleAIError = useCallback((error: unknown, operation: string) => {
    let retryable = false;
    let errorMessage = "Nieznany błąd";

    const aiError = error as AIErrorResponse & { name?: string; message?: string };

    if (aiError.name === "AbortError") {
      errorMessage = "Operacja została anulowana";
    } else if (aiError.message?.includes("timeout") || aiError.code === "AI_TIMEOUT") {
      errorMessage = "AI potrzebuje więcej czasu. Spróbuj ponownie.";
      retryable = true;
    } else if (aiError.code === "NETWORK_ERROR" || !navigator.onLine) {
      errorMessage = "Sprawdź połączenie internetowe i spróbuj ponownie";
      retryable = true;
    } else if (aiError.code === "SERVER_ERROR") {
      errorMessage = "Wystąpił problem z serwerem. Spróbuj później.";
      retryable = true;
    } else if (aiError.code === "INVALID_INPUT") {
      errorMessage = aiError.details || "Nieprawidłowe dane wejściowe";
      retryable = false;
    } else {
      errorMessage = aiError.message || `Błąd ${operation}`;
      retryable = true; // Domyślnie pozwalamy na retry dla nieznanych błędów
    }

    const thrownError = new Error(errorMessage);
    setState((prev) => ({
      ...prev,
      isGenerating: false,
      isModifying: false,
      isSaving: false,
      canCancel: false,
      error: thrownError,
      retryable,
    }));

    return thrownError;
  }, []);

  const makeRequest = useCallback(
    async (
      url: string,
      body:
        | GenerateRecipeCommand
        | ModifyRecipeCommand
        | SaveRecipeCommand
        | (ModifyRecipeCommand & { recipe_id: number }),
      timeout: number = AI_TIMEOUT,
      retryCount = 0
    ): Promise<Response> => {
      // Utwórz nowy AbortController dla tej operacji
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Timeout handler
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeout);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        abortControllerRef.current = null;

        if (!response.ok) {
          const errorData: AIErrorResponse = await response.json().catch(() => ({
            error: "Błąd komunikacji z serwerem",
            code: "NETWORK_ERROR" as const,
          }));

          // Sprawdź czy warto retry dla tego typu błędu
          if (
            retryCount < MAX_RETRY_ATTEMPTS &&
            (response.status >= 500 || errorData.code === "AI_TIMEOUT" || errorData.code === "NETWORK_ERROR")
          ) {
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[retryCount] || 4000));
            return makeRequest(url, body, timeout, retryCount + 1);
          }

          throw errorData;
        }

        return response;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        abortControllerRef.current = null;

        const errorObj = error as { name?: string; code?: string; message?: string };

        if (errorObj.name === "AbortError") {
          throw { code: "AI_TIMEOUT", message: "Request timeout" };
        }

        // Retry dla błędów sieciowych
        if (retryCount < MAX_RETRY_ATTEMPTS && (errorObj.code === "NETWORK_ERROR" || !navigator.onLine)) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[retryCount] || 4000));
          return makeRequest(url, body, timeout, retryCount + 1);
        }

        throw error;
      }
    },
    []
  );

  const generateRecipe = useCallback(
    async (params: GenerateRecipeCommand): Promise<GeneratedRecipeDto | null> => {
      // Zapisz operację dla retry
      lastOperationRef.current = { type: "generate", params };

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        error: null,
        generatedRecipe: null,
        retryable: false,
        canCancel: true,
      }));

      try {
        const response = await makeRequest("/api/ai/generate-recipe", params);
        const generatedRecipe = (await response.json()) as GeneratedRecipeDto;

        setState((prev) => ({
          ...prev,
          isGenerating: false,
          generatedRecipe,
          canCancel: false,
        }));

        return generatedRecipe;
      } catch (error) {
        const thrownError = handleAIError(error, "generowania przepisu");
        throw thrownError;
      }
    },
    [makeRequest, handleAIError]
  );

  const modifyRecipe = useCallback(
    async (id: number, params: ModifyRecipeCommand): Promise<ModifiedRecipeDto | null> => {
      // Zapisz operację dla retry
      lastOperationRef.current = { type: "modify", params, id };

      setState((prev) => ({
        ...prev,
        isModifying: true,
        error: null,
        modifiedRecipe: null,
        retryable: false,
        canCancel: true,
      }));

      try {
        const response = await makeRequest("/api/ai/modify-recipe", {
          ...params,
          recipe_id: id,
        });
        const modifiedRecipe = (await response.json()) as ModifiedRecipeDto;

        setState((prev) => ({
          ...prev,
          isModifying: false,
          modifiedRecipe,
          canCancel: false,
        }));

        return modifiedRecipe;
      } catch (error) {
        const thrownError = handleAIError(error, "modyfikacji przepisu");
        throw thrownError;
      }
    },
    [makeRequest, handleAIError]
  );

  const saveAIRecipe = useCallback(
    async (params: SaveRecipeCommand): Promise<RecipeDto | null> => {
      // Zapisz operację dla retry
      lastOperationRef.current = { type: "save", params };

      setState((prev) => ({
        ...prev,
        isSaving: true,
        error: null,
        savedRecipe: null,
        retryable: false,
        canCancel: true,
      }));

      try {
        const response = await makeRequest("/api/ai/save-recipe", params);
        const savedRecipe = (await response.json()) as RecipeDto;

        setState((prev) => ({
          ...prev,
          isSaving: false,
          savedRecipe,
          canCancel: false,
        }));

        return savedRecipe;
      } catch (error) {
        const thrownError = handleAIError(error, "zapisywania przepisu AI");
        throw thrownError;
      }
    },
    [makeRequest, handleAIError]
  );

  const retryLastOperation = useCallback(async () => {
    if (!lastOperationRef.current) {
      throw new Error("Brak operacji do powtórzenia");
    }

    const { type, params, id } = lastOperationRef.current;

    switch (type) {
      case "generate":
        return await generateRecipe(params as GenerateRecipeCommand);
      case "modify":
        if (id === undefined) {
          throw new Error("Brak ID przepisu dla operacji modyfikacji");
        }
        return await modifyRecipe(id, params as ModifyRecipeCommand);
      case "save":
        return await saveAIRecipe(params as SaveRecipeCommand);
      default:
        throw new Error("Nieznany typ operacji");
    }
  }, [generateRecipe, modifyRecipe, saveAIRecipe]);

  return {
    ...state,
    generateRecipe,
    modifyRecipe,
    saveAIRecipe,
    resetAIState,
    retryLastOperation,
    cancelOperation,
  };
}
