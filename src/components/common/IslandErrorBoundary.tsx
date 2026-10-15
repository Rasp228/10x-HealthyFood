import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { reportClientError } from "@/lib/utils/client-error-reporter";

/**
 * Fallback wyspy, która wywróciła się w renderze. Osobny komponent bez stanu, żeby kitchen sink
 * `/dev/diary-states` mógł go narysować z samego SSR, bez rzucania wyjątku.
 *
 * Bez treści błędu: komunikat wyjątku bywa techniczny albo niesie dane, a pełny opis i tak
 * wyjeżdża do logu przez `reportClientError`.
 */
export function IslandErrorFallback() {
  return (
    <Card className="border-destructive/30" role="alert" data-testid="island-error-fallback">
      <CardContent className="flex flex-col items-center gap-4 text-center">
        <p className="font-medium text-destructive">Coś poszło nie tak. Odśwież stronę.</p>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Odśwież
        </Button>
      </CardContent>
    </Card>
  );
}

interface IslandErrorBoundaryProps {
  children: ReactNode;
  /** Nazwa wyspy w zgłoszeniu (`source`) - po niej linię `client.boundary` łączy się z widokiem. */
  name: string;
}

interface IslandErrorBoundaryState {
  hasError: boolean;
}

/**
 * Granica błędów jednej wyspy. Wyjątek w renderze daje komunikat i zgłoszenie
 * (`client.boundary`), a nie pustą albo uciętą stronę - bez granicy React odmontowuje całe drzewo
 * wyspy i zostaje po nim dziura w layoucie.
 *
 * Klasa, bo React nie ma hooka na `componentDidCatch` / `getDerivedStateFromError`. Granica nie
 * łapie błędów z handlerów zdarzeń ani z kodu asynchronicznego - te trafiają do globalnych
 * handlerów reportera (`installGlobalHandlers`).
 */
export default class IslandErrorBoundary extends Component<IslandErrorBoundaryProps, IslandErrorBoundaryState> {
  state: IslandErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): IslandErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      kind: "boundary",
      message: error.message || error.name,
      // Stos komponentów mówi, która część wyspy padła - stos JS wskazuje tylko zminifikowany plik.
      stack: [error.stack, info.componentStack].filter(Boolean).join("\n"),
      source: this.props.name,
    });
  }

  render() {
    if (this.state.hasError) return <IslandErrorFallback />;

    return this.props.children;
  }
}
