import { useSyncExternalStore } from "react";

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

/**
 * Stan toastów żyje poza Reactem, w module.
 *
 * Wcześniej trzymał go `useState` wewnątrz hooka, więc każdy komponent wołający `useToast`
 * dostawał własną, niezależną listę — `ToastContainer` renderował swoją (zawsze pustą),
 * a komponent wołający `showToast` dopisywał do swojej (nigdy nierenderowanej). Efekt:
 * żaden toast nie był widoczny. Wspólny store naprawia to bez opakowywania każdej wyspy
 * w provider - wyspy Astro to osobne drzewa Reacta, więc kontekst i tak by ich nie połączył.
 */
let toasts: Toast[] = [];
const listeners = new Set<() => void>();
const EMPTY: Toast[] = [];

function setToasts(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function hideToast(id: string) {
  if (!toasts.some((toast) => toast.id === id)) return;
  setToasts(toasts.filter((toast) => toast.id !== id));
}

function showToast(message: string, type: ToastType, duration = 5000) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  setToasts([...toasts, { id, message, type, duration }]);

  // Siatka bezpieczeństwa: normalnie toast znika sam, gdy `Toast` po animacji wywoła `onClose`.
  // Zapas 400 ms pozwala tej animacji dobiec; bez tego wpis zostałby w store na zawsze,
  // gdyby akurat nic nie renderowało kontenera.
  if (duration > 0) {
    setTimeout(() => hideToast(id), duration + 400);
  }
}

export function useToast(): UseToastState & UseToastActions {
  const currentToasts = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY
  );

  return {
    toasts: currentToasts,
    showToast,
    hideToast,
  };
}
