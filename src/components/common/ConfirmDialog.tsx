import React from "react";
import { Button } from "@/components/ui/button";
import BaseModal from "@/components/ui/BaseModal";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  severity?: "warning" | "danger" | "info";
  /**
   * Identyfikator testowy dialogu. Przyciski dostają wtedy `${testid}-confirm` / `${testid}-cancel`,
   * bo jeden ekran potrafi mieć kilka dialogów potwierdzenia. Bez propu DOM zostaje bez zmian.
   */
  "data-testid"?: string;
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
  "data-testid": dataTestId,
}: ConfirmDialogProps) {
  const severityConfig = {
    warning: {
      iconClass: "text-amber-600 dark:text-amber-400",
      confirmButtonVariant: "default" as const,
    },
    danger: {
      iconClass: "text-red-600 dark:text-red-400",
      confirmButtonVariant: "destructive" as const,
    },
    info: {
      iconClass: "text-blue-600 dark:text-blue-400",
      confirmButtonVariant: "default" as const,
    },
  };

  const config = severityConfig[severity];

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="md" zIndex={70} data-testid={dataTestId}>
      <div className="flex items-start space-x-4">
        <div className={`mt-1 ${config.iconClass}`} aria-hidden="true">
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
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} data-testid={dataTestId ? `${dataTestId}-cancel` : undefined}>
          {cancelLabel}
        </Button>
        <Button
          variant={config.confirmButtonVariant}
          onClick={onConfirm}
          data-testid={dataTestId ? `${dataTestId}-confirm` : undefined}
        >
          {confirmLabel}
        </Button>
      </div>
    </BaseModal>
  );
}
