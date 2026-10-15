import { z } from "zod";

/** Najwięcej zdarzeń w jednym żądaniu - tyle samo, ile reporter wysyła na jedno załadowanie strony. */
export const MAX_CLIENT_ERROR_EVENTS = 5;

/** Sufit całego ciała żądania w bajtach, sprawdzany przed `JSON.parse`. */
export const MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024;

export const CLIENT_ERROR_MESSAGE_MAX = 500;
export const CLIENT_ERROR_STACK_MAX = 4000;

/**
 * Jedno zdarzenie błędu z przeglądarki. `kind` staje się częścią nazwy zdarzenia w logu
 * (`client.<kind>`), więc zbiór jest zamknięty - dowolny napis od klienta nie wyprodukuje nowej
 * nazwy zdarzenia.
 */
export const clientErrorEventSchema = z.object({
  kind: z.enum(["error", "unhandledrejection", "boundary", "fetch"]),
  message: z.string().min(1).max(CLIENT_ERROR_MESSAGE_MAX),
  stack: z.string().max(CLIENT_ERROR_STACK_MAX).optional(),
  source: z.string().max(CLIENT_ERROR_MESSAGE_MAX).optional(),
  path: z.string().min(1).max(CLIENT_ERROR_MESSAGE_MAX),
  at: z.iso.datetime(),
});

export const clientErrorReportSchema = z.object({
  events: z.array(clientErrorEventSchema).min(1).max(MAX_CLIENT_ERROR_EVENTS),
});

export type ClientErrorEvent = z.infer<typeof clientErrorEventSchema>;
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
