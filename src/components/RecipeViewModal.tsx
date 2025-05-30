import React, { useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import RecipeDetailContent from "./RecipeDetailContent";
import { useRecipeModal } from "../hooks/useRecipeModal";

interface RecipeViewModalContainerProps {
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
  onSuccess?: () => void;
}

export default function RecipeViewModalContainer({ onEdit, onDelete, onAI, onSuccess }: RecipeViewModalContainerProps) {
  const { isOpen, recipeId, recipe, isLoading, error, closeModal } = useRecipeModal();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Obsługa klawisza ESC
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }

      // Focus trapping
      if (event.key === "Tab" && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0] as HTMLElement;
        const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.shiftKey) {
          if (document.activeElement === firstFocusable) {
            lastFocusable?.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            firstFocusable?.focus();
            event.preventDefault();
          }
        }
      }
    },
    [closeModal]
  );

  // Zarządzanie focusem i scrollem
  useEffect(() => {
    if (isOpen) {
      // Zapisz aktualnie aktywny element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Dodaj event listenery
      document.addEventListener("keydown", handleKeyDown);

      // Blokuj scroll na body
      document.body.style.overflow = "hidden";

      // Focus na modal po niewielkim opóźnieniu (dla animacji)
      setTimeout(() => {
        modalRef.current?.focus();
      }, 100);
    } else {
      // Usuń event listenery
      document.removeEventListener("keydown", handleKeyDown);

      // Przywróć scroll
      document.body.style.overflow = "unset";

      // Przywróć focus do poprzedniego elementu
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, handleKeyDown]);

  // Obsługa kliknięcia w backdrop (poza modalem)
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        closeModal();
      }
    },
    [closeModal]
  );

  // Obsługa akcji - przekazanie callbacków z ID
  const handleEdit = useCallback(() => {
    if (recipeId && onEdit) {
      onEdit(recipeId); // Nie zamykaj modala szczegółów
    }
  }, [recipeId, onEdit]);

  const handleDelete = useCallback(() => {
    if (recipeId && onDelete) {
      onDelete(recipeId);
      closeModal(); // Zamknij modal tylko po usunięciu
    }
  }, [recipeId, onDelete, closeModal]);

  const handleAI = useCallback(() => {
    if (recipeId && onAI) {
      onAI(recipeId); // Nie zamykaj modala szczegółów
    }
  }, [recipeId, onAI]);

  const handleSuccess = useCallback(() => {
    onSuccess?.();
  }, [onSuccess]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in-0 duration-200">
      <div className="fixed inset-0" onClick={handleBackdropClick} aria-hidden="true" />
      <div
        ref={modalRef}
        className="relative mx-2 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg bg-background shadow-xl animate-in zoom-in-95 slide-in-from-bottom-8 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        {/* Nagłówek modala z przyciskiem zamknij - sticky dla długiej zawartości */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur-sm p-4">
          <h2 id="modal-title" className="text-lg font-semibold">
            Szczegóły przepisu
          </h2>
          <Button variant="ghost" size="sm" onClick={closeModal} aria-label="Zamknij modal">
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
              <path d="M18 6L6 18"></path>
              <path d="M6 6l12 12"></path>
            </svg>
          </Button>
        </div>

        {/* Zawartość modala - scrollowalna z lepszym paddingiem na mobile */}
        <div className="max-h-[calc(95vh-4rem)] sm:max-h-[calc(90vh-4rem)] overflow-y-auto p-4 sm:p-6">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950">
              <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">Wystąpił błąd</h3>
              <p className="text-red-600 dark:text-red-400">{error.message}</p>
            </div>
          ) : (
            <RecipeDetailContent
              recipe={recipe}
              isLoading={isLoading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAI={handleAI}
              onSuccess={handleSuccess}
              showBackButton={false}
              className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300 delay-100"
            />
          )}
        </div>
      </div>
    </div>
  );
}
