import React from "react";
import { Button } from "./button";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button";

// Definicje najczęściej używanych ikon jako komponenty
const icons = {
  edit: (
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
  ),
  delete: (
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
  ),
  ai: (
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
  ),
  plus: (
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
      <path d="M12 5v14"></path>
      <path d="M5 12h14"></path>
    </svg>
  ),
  back: (
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
      <path d="M19 12H5"></path>
      <path d="M12 19l-7-7 7-7"></path>
    </svg>
  ),
  close: (
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
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  ),
  check: (
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
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
} as const;

type IconName = keyof typeof icons;

interface IconButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  icon: IconName;
  children?: React.ReactNode;
  asChild?: boolean;
  loading?: boolean;
  "data-testid"?: string;
}

export default function IconButton({
  icon,
  children,
  variant = "outline",
  size = "default",
  className,
  loading = false,
  "data-testid": dataTestId,
  ...props
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={`gap-2 ${className || ""}`}
      disabled={loading || props.disabled}
      data-testid={dataTestId}
      {...props}
    >
      {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" /> : icons[icon]}
      {children}
    </Button>
  );
}

export { type IconName, icons };
