import React from "react";

/** Dzień bez wpisów. Bez karty sumy i paska celu - pusty dzień ich nie rysuje. */
export default function DiaryEmptyState() {
  return (
    <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center" data-testid="diary-empty-state">
      <h3 className="mb-2 text-xl font-medium">Brak wpisów</h3>
      <p className="text-muted-foreground">Ten dzień nie ma jeszcze żadnych wpisów.</p>
    </div>
  );
}
