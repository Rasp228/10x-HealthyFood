import React from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  severity?: "warning" | "danger" | "info";
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Potwierdź",
  cancelLabel = "Anuluj",
  onConfirm,
  onCancel,
  severity = "warning",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  // Style w zależności od ważności
  const getSeverityStyles = () => {
    switch (severity) {
      case "danger":
        return {
          headerClass: "border-b border-red-200 dark:border-red-800",
          confirmButtonClass: "bg-red-600 hover:bg-red-700 text-white",
          iconClass: "text-red-600",
        };
      case "warning":
        return {
          headerClass: "border-b border-amber-200 dark:border-amber-800",
          confirmButtonClass: "bg-amber-600 hover:bg-amber-700 text-white",
          iconClass: "text-amber-600",
        };
      case "info":
      default:
        return {
          headerClass: "border-b border-blue-200 dark:border-blue-800",
          confirmButtonClass: "bg-blue-600 hover:bg-blue-700 text-white",
          iconClass: "text-blue-600",
        };
    }
  };

  const styles = getSeverityStyles();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-message"
    >
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <div className={`mb-4 flex items-center justify-between pb-3 ${styles.headerClass}`}>
          <h2 className="text-xl font-bold" id="dialog-title">
            {title}
          </h2>
          <button onClick={onCancel} className="rounded-full p-2 hover:bg-muted" aria-label="Zamknij">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18"></path>
              <path d="m6 6 12 12"></path>
            </svg>
          </button>
        </div>

        <div className="mb-6 flex items-start space-x-4">
          <div className={`mt-1 ${styles.iconClass}`} aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" x2="12" y1="9" y2="13"></line>
              <line x1="12" x2="12.01" y1="17" y2="17"></line>
            </svg>
          </div>
          <p className="text-sm text-muted-foreground" id="dialog-message">
            {message}
          </p>
        </div>

        <div className="flex justify-end space-x-4">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <button
            className={`inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${styles.confirmButtonClass}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
