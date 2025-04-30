import React from "react";
import { Button } from "@/components/ui/button";

interface ActionPanelProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
}

export default function ActionPanel({ onEdit, onDelete, onAI }: ActionPanelProps) {
  return (
    <div className="flex gap-2">
      {onEdit && (
        <Button variant="outline" onClick={onEdit} className="gap-2">
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
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          </svg>
          Edytuj
        </Button>
      )}

      {onAI && (
        <Button variant="outline" onClick={onAI} className="gap-2 text-purple-500 hover:text-purple-600">
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
          >
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m4.9 4.9 14.2 14.2"></path>
            <path d="M9 9h.01"></path>
            <path d="M15 15h.01"></path>
          </svg>
          Modyfikuj z AI
        </Button>
      )}

      {onDelete && (
        <Button variant="outline" onClick={onDelete} className="gap-2 text-red-500 hover:text-red-600">
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
          >
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
          Usuń
        </Button>
      )}
    </div>
  );
}
