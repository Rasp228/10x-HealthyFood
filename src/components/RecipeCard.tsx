import React from "react";
import { Button } from "@/components/ui/button";
import type { RecipeDto } from "../types";

interface RecipeCardProps {
  recipe: RecipeDto;
  onView?: (id: number) => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
}

export default function RecipeCard({ recipe, onView, onEdit, onDelete, onAI }: RecipeCardProps) {
  // Formatowanie daty
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };

  // Przygotowanie skróconej treści przepisu
  const getContentPreview = (content: string) => {
    // Usuwamy znaczniki Markdown
    const plainText = content.replace(/#{1,6} |[*_~`]/g, "");
    const maxLength = 120;

    if (plainText.length <= maxLength) return plainText;

    return plainText.substring(0, maxLength) + "...";
  };

  // Obsługa kliknięcia w kartę
  const handleCardClick = () => {
    if (onView) {
      onView(recipe.id);
    }
  };

  // Obsługa kliknięć w przyciski akcji - zapobieganie propagacji
  const handleActionClick = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation(); // Zapobiegamy otwieraniu modala przy kliknięciu w przycisk akcji
    action();
  };

  return (
    <div
      className={`group relative rounded-lg border bg-card p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-lg ${
        onView ? "cursor-pointer hover:bg-muted/50 hover:scale-[1.02] hover:border-primary/20" : ""
      }`}
      onClick={handleCardClick}
      role={onView ? "button" : undefined}
      tabIndex={onView ? 0 : undefined}
      onKeyDown={(e) => {
        if (onView && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={onView ? `Otwórz szczegóły przepisu: ${recipe.title}` : undefined}
    >
      {/* Etykieta AI jeśli przepis jest wygenerowany przez AI */}
      {recipe.ai_generated && (
        <div className="absolute right-2 top-2 rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200 transition-transform group-hover:scale-105">
          AI
        </div>
      )}

      {/* Subtle hover indicator */}
      {onView && (
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
            className="text-primary"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-3-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </div>
      )}

      <h3 className="mb-2 text-lg sm:text-xl font-semibold leading-tight group-hover:text-primary transition-colors">
        {recipe.title}
      </h3>

      <p className="mb-4 text-xs sm:text-sm text-muted-foreground">{formatDate(recipe.created_at)}</p>

      <p className="mb-6 text-sm leading-relaxed text-foreground/80">{getContentPreview(recipe.content)}</p>

      {/* Opcjonalne tagi/parametry */}
      {recipe.additional_params && (
        <div className="mb-4 flex flex-wrap gap-1">
          {recipe.additional_params
            .split(",")
            .slice(0, 3)
            .map((tag, index) => (
              <span key={index} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {tag.trim()}
              </span>
            ))}
          {recipe.additional_params.split(",").length > 3 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              +{recipe.additional_params.split(",").length - 3}
            </span>
          )}
        </div>
      )}

      {/* Toolbar akcji - widoczny po najechaniu myszą lub zawsze na touch devices */}
      <div className="mt-auto flex justify-end gap-1 sm:gap-2 opacity-100 sm:opacity-0 transition-opacity group-hover:opacity-100">
        {onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleActionClick(e, () => onEdit(recipe.id))}
            aria-label="Edytuj przepis"
            className="h-8 px-2 sm:px-3 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="sm:mr-1"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
            </svg>
            <span className="hidden sm:inline">Edytuj</span>
          </Button>
        )}

        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleActionClick(e, () => onDelete(recipe.id))}
            aria-label="Usuń przepis"
            className="h-8 px-2 sm:px-3 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="sm:mr-1"
            >
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
            <span className="hidden sm:inline">Usuń</span>
          </Button>
        )}

        {onAI && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => handleActionClick(e, () => onAI(recipe.id))}
            aria-label="Modyfikuj z AI"
            className="h-8 px-2 sm:px-3 text-xs text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="sm:mr-1"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m4.9 4.9 14.2 14.2"></path>
              <path d="M9 9h.01"></path>
              <path d="M15 15h.01"></path>
            </svg>
            <span className="hidden sm:inline">AI</span>
          </Button>
        )}
      </div>
    </div>
  );
}
