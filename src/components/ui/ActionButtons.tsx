import React from "react";
import IconButton from "./IconButton";

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  aiLabel?: string;
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
  loading?: boolean;
}

// Kompozycyjny komponent przycisków akcji
export function ActionButtons({
  onEdit,
  onDelete,
  onAI,
  editLabel = "Edytuj",
  deleteLabel = "Usuń",
  aiLabel = "AI",
  size = "default",
  disabled = false,
  loading = false,
}: ActionButtonsProps) {
  return (
    <div className="flex gap-2">
      {onEdit && (
        <EditButton onClick={onEdit} size={size} disabled={disabled} loading={loading}>
          {editLabel}
        </EditButton>
      )}
      {onAI && (
        <AIButton onClick={onAI} size={size} disabled={disabled} loading={loading}>
          {aiLabel}
        </AIButton>
      )}
      {onDelete && (
        <DeleteButton onClick={onDelete} size={size} disabled={disabled} loading={loading}>
          {deleteLabel}
        </DeleteButton>
      )}
    </div>
  );
}

// Specjalizowane komponenty przycisków
interface BaseActionButtonProps {
  onClick: (event?: React.MouseEvent) => void;
  children?: React.ReactNode;
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function EditButton({
  onClick,
  children,
  size = "default",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="edit"
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={`hover:bg-primary/10 hover:text-primary transition-colors ${className || ""}`}
      aria-label="Edytuj"
      data-testid={dataTestId}
    >
      {children}
    </IconButton>
  );
}

export function DeleteButton({
  onClick,
  children,
  size = "default",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="delete"
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={`text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors ${className || ""}`}
      aria-label="Usuń"
      data-testid={dataTestId}
    >
      {children}
    </IconButton>
  );
}

export function AIButton({
  onClick,
  children,
  size = "default",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="ai"
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={`text-purple-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors ${className || ""}`}
      aria-label="Modyfikuj z AI"
      data-testid={dataTestId}
    >
      {children}
    </IconButton>
  );
}

export function AddButton({
  onClick,
  children,
  size = "default",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="plus"
      variant="default"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={className}
      aria-label="Dodaj"
      data-testid={dataTestId || "add-recipe-button"}
    >
      {children}
    </IconButton>
  );
}

export function BackButton({
  onClick,
  children,
  size = "default",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="back"
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={className}
      aria-label="Wróć"
      data-testid={dataTestId}
    >
      {children}
    </IconButton>
  );
}

export function CloseButton({
  onClick,
  children,
  size = "sm",
  disabled,
  loading,
  className,
  "data-testid": dataTestId,
}: BaseActionButtonProps) {
  return (
    <IconButton
      icon="close"
      variant="ghost"
      size={size}
      onClick={onClick}
      disabled={disabled}
      loading={loading}
      className={`h-auto p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 ${className || ""}`}
      aria-label="Zamknij"
      data-testid={dataTestId || "close-button"}
    >
      {children}
    </IconButton>
  );
}
