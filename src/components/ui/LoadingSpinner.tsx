import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
  className?: string;
}

export default function LoadingSpinner({ size = "md", message, className = "" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  const borderClasses = {
    sm: "border-2",
    md: "border-b-2",
    lg: "border-4",
  };

  return (
    <div className={`text-center ${className}`} aria-live="polite" aria-busy="true">
      <div
        className={`inline-block animate-spin rounded-full ${sizeClasses[size]} ${borderClasses[size]} border-primary ${size === "lg" ? "border-t-transparent" : ""}`}
      />
      {message && <p className="mt-2 text-muted-foreground">{message}</p>}
    </div>
  );
}
