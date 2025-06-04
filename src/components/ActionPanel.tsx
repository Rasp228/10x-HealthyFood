import React from "react";
import { ActionButtons } from "@/components/ui/ActionButtons";

interface ActionPanelProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
}

export default function ActionPanel({ onEdit, onDelete, onAI }: ActionPanelProps) {
  return (
    <ActionButtons
      onEdit={onEdit}
      onDelete={onDelete}
      onAI={onAI}
      editLabel="Edytuj"
      deleteLabel="Usuń"
      aiLabel="Modyfikuj z AI"
    />
  );
}
