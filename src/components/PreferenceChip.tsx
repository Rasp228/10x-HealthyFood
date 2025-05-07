import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Edit2, Check, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import type { PreferenceDto } from "../types";

// Tymczasowy komponent Input, dopóki nie zostanie zaimplementowany w shadcn/ui
const Input = ({
  type,
  value,
  onChange,
  className = "",
  placeholder,
  disabled,
  maxLength,
}: {
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
}) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    className={`px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md ${className}`}
    placeholder={placeholder}
    disabled={disabled}
    maxLength={maxLength}
  />
);

interface PreferenceChipProps {
  preference: PreferenceDto & {
    id: number;
    category: string;
    value: string;
    user_id: string;
    created_at: string;
  };
  onUpdate: (id: number, newValue: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  categoryLabel?: string;
}

export default function PreferenceChip({ preference, onUpdate, onDelete, categoryLabel }: PreferenceChipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState(preference.value);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // Kategorie i ich kolory tła - dostosowane do nowych kategorii
  const categoryColors: Record<string, string> = {
    diet: "bg-green-100 dark:bg-green-900",
    allergy: "bg-red-100 dark:bg-red-900",
    dislike: "bg-orange-100 dark:bg-orange-900",
    like: "bg-blue-100 dark:bg-blue-900",
    excluded: "bg-purple-100 dark:bg-purple-900",
    other: "bg-gray-100 dark:bg-gray-800",
  };

  // Określenie koloru tła na podstawie kategorii
  const bgColorClass = categoryColors[preference.category] || categoryColors.other;

  // Rozpoczęcie edycji
  const startEditing = () => {
    setNewValue(preference.value);
    setError(null);
    setIsEditing(true);
  };

  // Anulowanie edycji
  const cancelEditing = () => {
    setIsEditing(false);
    setError(null);
  };

  // Zapisanie zmian
  const saveChanges = async () => {
    if (!newValue.trim()) {
      setError("Wartość nie może być pusta");
      return;
    }

    if (newValue.length > 50) {
      setError("Wartość nie może przekraczać 50 znaków");
      return;
    }

    setIsLoading(true);
    try {
      await onUpdate(preference.id, newValue.trim());
      setIsEditing(false);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Wystąpił błąd podczas aktualizacji");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Usuwanie preferencji
  const handleDeleteConfirm = async () => {
    setIsLoading(true);
    try {
      await onDelete(preference.id);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Wystąpił błąd podczas usuwania");
      }
    } finally {
      setIsLoading(false);
      setIsConfirmDeleteOpen(false);
    }
  };

  // Otwieranie dialogu potwierdzenia usunięcia
  const openDeleteConfirm = () => {
    setIsConfirmDeleteOpen(true);
  };

  // Zamykanie dialogu potwierdzenia usunięcia
  const closeDeleteConfirm = () => {
    setIsConfirmDeleteOpen(false);
  };

  return (
    <div className={`rounded-lg p-2 mb-2 ${bgColorClass} transition-all flex items-center justify-between shadow-sm`}>
      {isEditing ? (
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewValue(e.target.value)}
              className="text-sm h-8"
              placeholder="Nowa wartość"
              disabled={isLoading}
              maxLength={50}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={saveChanges}
              disabled={isLoading}
              className="h-8 w-8 bg-green-200 hover:bg-green-300 dark:bg-green-800 dark:hover:bg-green-700"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cancelEditing}
              disabled={isLoading}
              className="h-8 w-8 bg-red-200 hover:bg-red-300 dark:bg-red-800 dark:hover:bg-red-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex items-center">
            {categoryLabel && <span className="text-xs opacity-75 mr-2 font-medium">{categoryLabel}:</span>}
            <span className="font-medium text-sm">{preference.value}</span>
          </div>
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={startEditing}
              disabled={isLoading}
              className="h-7 w-7 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={openDeleteConfirm}
              disabled={isLoading}
              className="h-7 w-7 hover:bg-black/10 dark:hover:bg-white/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}

      {/* Dialog potwierdzenia usunięcia */}
      <ConfirmDialog
        isOpen={isConfirmDeleteOpen}
        title="Usuń preferencję"
        message={`Czy na pewno chcesz usunąć preferencję "${preference.value}"?`}
        confirmLabel="Usuń"
        cancelLabel="Anuluj"
        onConfirm={handleDeleteConfirm}
        onCancel={closeDeleteConfirm}
        severity="danger"
      />
    </div>
  );
}
