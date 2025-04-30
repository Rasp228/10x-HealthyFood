import React from "react";
import { Button } from "@/components/ui/button";
import type { RecipeDto } from "../types";

interface RecipeCardProps {
  recipe: RecipeDto;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
}

export default function RecipeCard({ recipe, onEdit, onDelete, onAI }: RecipeCardProps) {
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

  return (
    <div className="group relative rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      {/* Etykieta AI jeśli przepis jest wygenerowany przez AI */}
      {recipe.ai_generated && (
        <div className="absolute right-2 top-2 rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          AI
        </div>
      )}

      <h3 className="mb-2 text-xl font-semibold">{recipe.title}</h3>

      <p className="mb-4 text-sm text-muted-foreground">{formatDate(recipe.created_at)}</p>

      <p className="mb-6 text-sm">{getContentPreview(recipe.content)}</p>

      {/* Opcjonalne tagi/parametry */}
      {recipe.additional_params && (
        <div className="mb-4 flex flex-wrap gap-1">
          {recipe.additional_params.split(",").map((tag, index) => (
            <span key={index} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {tag.trim()}
            </span>
          ))}
        </div>
      )}

      {/* Toolbar akcji - widoczny po najechaniu myszą */}
      <div className="mt-auto flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        {onEdit && (
          <Button variant="ghost" size="sm" onClick={() => onEdit(recipe.id)} aria-label="Edytuj przepis">
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
              className="mr-1"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
            </svg>
            Edytuj
          </Button>
        )}

        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(recipe.id)}
            aria-label="Usuń przepis"
            className="text-red-500 hover:text-red-600"
          >
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
              className="mr-1"
            >
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
            Usuń
          </Button>
        )}

        {onAI && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAI(recipe.id)}
            aria-label="Modyfikuj z AI"
            className="text-purple-500 hover:text-purple-600"
          >
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
              className="mr-1"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <path d="m4.9 4.9 14.2 14.2"></path>
              <path d="M9 9h.01"></path>
              <path d="M15 15h.01"></path>
            </svg>
            AI
          </Button>
        )}
      </div>
    </div>
  );
}
