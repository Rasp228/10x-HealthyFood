import type { ZodError } from "zod";

/** Pojedynczy błąd walidacji w kształcie, w jakim wychodzi na zewnątrz API. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Kształt pola `details` w odpowiedziach API zwracających błąd walidacji.
 *
 * Nie zwracamy surowych `error.issues` — Zod 4 dokłada tam pola wewnętrzne
 * (m.in. `pattern` z pełnym regexem), które nie są kontraktem API i zmieniają się
 * między wersjami Zoda.
 */
export function zodIssues(error: ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/** Jednolinijkowy komunikat dla odpowiedzi, których kontrakt przewiduje `details: string`. */
export function zodMessage(error: ZodError): string {
  return zodIssues(error)
    .map(({ path, message }) => (path ? `${path}: ${message}` : message))
    .join(", ");
}
