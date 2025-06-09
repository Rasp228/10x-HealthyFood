import React, { useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { CloseButton } from "./ActionButtons";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl" | "7xl";
  showCloseButton?: boolean;
  zIndex?: number;
  "data-testid"?: string;
}

export default function BaseModal({
  isOpen,
  onClose,
  title,
  children,
  className = "",
  maxWidth = "4xl",
  showCloseButton = true,
  zIndex = 50,
  "data-testid": dataTestId,
}: BaseModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Mapy dla maksymalnych szerokości
  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
    "6xl": "max-w-6xl",
    "7xl": "max-w-7xl",
  };

  // Obsługa klawisza ESC i focus trapping
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
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
    [onClose]
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
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/50 animate-in fade-in-0 duration-200"
      style={{ zIndex }}
      data-testid={dataTestId}
    >
      <div className="fixed inset-0" onClick={handleBackdropClick} aria-hidden="true" />
      <div
        ref={modalRef}
        className={`relative mx-2 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] w-full ${maxWidthClasses[maxWidth]} overflow-hidden rounded-lg bg-background shadow-xl animate-in zoom-in-95 slide-in-from-bottom-8 duration-200 ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        tabIndex={-1}
      >
        {/* Nagłówek modala z przyciskiem zamknij - tylko jeśli jest tytuł lub przycisk zamknij */}
        {(title || showCloseButton) && (
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 backdrop-blur-sm p-4">
            {title ? (
              <h2 id="modal-title" className="text-lg font-semibold" data-testid="modal-title">
                {title}
              </h2>
            ) : (
              <div></div>
            )}
            {showCloseButton && <CloseButton onClick={onClose} size="sm" data-testid="modal-close-button" />}
          </div>
        )}

        {/* Zawartość modala - scrollowalna z lepszym paddingiem na mobile */}
        <div className="max-h-[calc(95vh-4rem)] sm:max-h-[calc(90vh-4rem)] overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
