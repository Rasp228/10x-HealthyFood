import { useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface UseToastState {
  toasts: Toast[];
}

interface UseToastActions {
  showToast: (message: string, type: ToastType, duration?: number) => void;
  hideToast: (id: string) => void;
}

export function useToast(): UseToastState & UseToastActions {
  const [state, setState] = useState<UseToastState>({
    toasts: [],
  });

  const showToast = (message: string, type: ToastType, duration = 5000) => {
    const id = Date.now().toString();

    const newToast: Toast = {
      id,
      message,
      type,
      duration,
    };

    setState((prev) => ({
      ...prev,
      toasts: [...prev.toasts, newToast],
    }));

    // Automatyczne ukrycie po czasie
    if (duration > 0) {
      setTimeout(() => {
        hideToast(id);
      }, duration);
    }
  };

  const hideToast = (id: string) => {
    setState((prev) => ({
      ...prev,
      toasts: prev.toasts.filter((toast) => toast.id !== id),
    }));
  };

  return {
    ...state,
    showToast,
    hideToast,
  };
}
