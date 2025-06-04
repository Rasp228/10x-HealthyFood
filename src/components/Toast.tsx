import React, { useState, useEffect } from "react";
import { CloseButton } from "@/components/ui/ActionButtons";

interface ToastProps {
  message: string;
  type: "success" | "error" | "warning" | "info";
  duration?: number;
  onClose: () => void;
}

export default function Toast({ message, type, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Po zakończeniu animacji
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Style w zależności od typu
  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return {
          containerClass: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950",
          iconClass: "text-green-600 dark:text-green-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ),
        };
      case "error":
        return {
          containerClass: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950",
          iconClass: "text-red-600 dark:text-red-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          ),
        };
      case "warning":
        return {
          containerClass: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950",
          iconClass: "text-amber-600 dark:text-amber-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          ),
        };
      case "info":
      default:
        return {
          containerClass: "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950",
          iconClass: "text-blue-600 dark:text-blue-400",
          icon: (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" x2="12" y1="16" y2="12"></line>
              <line x1="12" x2="12.01" y1="8" y2="8"></line>
            </svg>
          ),
        };
    }
  };

  const styles = getTypeStyles();

  return (
    <div
      className={`fixed right-4 top-4 z-50 transition-opacity duration-300 ${isVisible ? "opacity-100" : "opacity-0"}`}
    >
      <div className={`flex items-center space-x-3 rounded-md border p-4 shadow-md ${styles.containerClass}`}>
        <div className={styles.iconClass}>{styles.icon}</div>
        <div className="flex-1">{message}</div>
        <CloseButton
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
        />
      </div>
    </div>
  );
}
