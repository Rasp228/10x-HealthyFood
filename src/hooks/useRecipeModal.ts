import { useState, useCallback } from "react";
import { useRecipe } from "./useRecipe";
import type { UseRecipeModalResult, RecipeDto } from "../types";

// Cache dla przepisów (ograniczony do ostatnich 10)
const MAX_CACHE_SIZE = 10;
const CACHE_TTL = 5 * 60 * 1000; // 5 minut

interface CachedRecipe {
  recipe: RecipeDto;
  timestamp: number;
}

// Prosta implementacja singletonowego stanu przez moduł
class RecipeModalState {
  private _isOpen = false;
  private _recipeId: number | null = null;
  private _cache = new Map<number, CachedRecipe>();
  private _listeners = new Set<() => void>();

  get isOpen() {
    return this._isOpen;
  }
  get recipeId() {
    return this._recipeId;
  }
  get cache() {
    return this._cache;
  }

  setIsOpen(isOpen: boolean) {
    this._isOpen = isOpen;
    this.notifyListeners();
  }

  setRecipeId(recipeId: number | null) {
    this._recipeId = recipeId;
    this.notifyListeners();
  }

  setCache(cache: Map<number, CachedRecipe>) {
    this._cache = cache;
    this.notifyListeners();
  }

  addListener(listener: () => void) {
    this._listeners.add(listener);
  }

  removeListener(listener: () => void) {
    this._listeners.delete(listener);
  }

  private notifyListeners() {
    this._listeners.forEach((listener) => listener());
  }
}

const modalState = new RecipeModalState();

export function useRecipeModal(): UseRecipeModalResult {
  const [, forceUpdate] = useState({});

  const triggerUpdate = useCallback(() => {
    forceUpdate({});
  }, []);

  // Rejestrujemy listener przy pierwszym renderze
  useState(() => {
    modalState.addListener(triggerUpdate);
    return () => modalState.removeListener(triggerUpdate);
  });

  // Używamy useRecipe tylko gdy modal jest otwarty i mamy ID
  const { recipe, isLoading, error, refetch } = useRecipe(
    modalState.isOpen && modalState.recipeId ? modalState.recipeId : undefined
  );

  // Funkcja do czyszczenia cache
  const cleanExpiredCache = useCallback((currentCache: Map<number, CachedRecipe>) => {
    const now = Date.now();
    const newCache = new Map(currentCache);

    // Usuń wygasłe wpisy
    for (const [id, cached] of newCache.entries()) {
      if (now - cached.timestamp > CACHE_TTL) {
        newCache.delete(id);
      }
    }

    // Jeśli nadal mamy za dużo wpisów, usuń najstarsze
    if (newCache.size > MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(newCache.entries()).sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = sortedEntries.slice(0, newCache.size - MAX_CACHE_SIZE);
      toRemove.forEach(([id]) => {
        newCache.delete(id);
      });
    }

    return newCache;
  }, []);

  const openModal = useCallback((id: number) => {
    if (id <= 0) {
      console.error("Nieprawidłowe ID przepisu:", id);
      return;
    }

    console.log("Opening modal for recipe:", id);

    // Sprawdź cache
    const cachedRecipe = modalState.cache.get(id);
    if (cachedRecipe && Date.now() - cachedRecipe.timestamp < CACHE_TTL) {
      console.log("Recipe loaded from cache:", id);
    }

    // Aktualizuj stan
    modalState.setRecipeId(id);
    modalState.setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    console.log("Closing modal");

    // Zachowaj w cache jeśli recipe zostało załadowane
    if (recipe && modalState.recipeId) {
      const cleanedCache = cleanExpiredCache(modalState.cache);
      const newCache = new Map(cleanedCache);
      newCache.set(modalState.recipeId, {
        recipe,
        timestamp: Date.now(),
      });
      modalState.setCache(newCache);
    }

    // Aktualizuj stan
    modalState.setIsOpen(false);
    modalState.setRecipeId(null);
  }, [recipe, cleanExpiredCache]);

  const handleRefetch = useCallback(() => {
    // Wyczyść cache dla tego przepisu przy refetch
    if (modalState.recipeId) {
      const newCache = new Map(modalState.cache);
      newCache.delete(modalState.recipeId);
      modalState.setCache(newCache);
    }
    refetch();
  }, [refetch]);

  return {
    isOpen: modalState.isOpen,
    recipeId: modalState.recipeId,
    recipe: recipe || null,
    isLoading,
    error,
    openModal,
    closeModal,
    refetch: handleRefetch,
  };
}
