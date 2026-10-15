import type { APIRoute } from "astro";
import { clientErrorReportSchema, MAX_CLIENT_ERROR_BODY_BYTES } from "../../lib/validations/client-errors/report";
import { zodIssues } from "../../lib/utils/validation-errors";
import { logError, logWarn } from "../../lib/utils/log";
import type { LogContext } from "../../lib/utils/log";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tooLarge = () => json({ error: "Zgłoszenie jest za duże" }, 413);

/**
 * Jedyne ujście błędów przeglądarki do logów funkcji (Vercel logs). Woła je reporter
 * `src/lib/utils/client-error-reporter.ts` - `navigator.sendBeacon`, a gdy go nie ma,
 * `fetch(..., { keepalive: true })`.
 *
 * Trasa nie jest w `PUBLIC_PATHS`: gościa przekierowuje middleware, a sprawdzenie `locals.user`
 * zostaje jako druga linia obrony. Przyjmuje tekst od klienta, więc pilnuje go trzema limitami:
 * rozmiar ciała (przed `JSON.parse`), liczba zdarzeń i długość pól (schemat w
 * `src/lib/validations/client-errors/report.ts`). Limitu częstości nie ma - świadomie, jak na
 * trasach AI.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "client_errors.post" };

  try {
    const user = locals.user;

    if (!user) {
      return json({ error: "Nieautoryzowany dostęp" }, 401);
    }

    logContext.userId = user.id;

    // Nagłówek pozwala odrzucić duże ciało bez czytania go. Sam mu nie ufamy - klient może go
    // pominąć albo skłamać - więc długość liczymy jeszcze raz na przeczytanym tekście.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(declaredLength) && declaredLength > MAX_CLIENT_ERROR_BODY_BYTES) {
      return tooLarge();
    }

    const text = await request.text();

    if (new TextEncoder().encode(text).byteLength > MAX_CLIENT_ERROR_BODY_BYTES) {
      return tooLarge();
    }

    // Ciało, które nie jest JSON-em, to błąd wejścia: `null` nie przechodzi schematu i daje 400.
    let rawData: unknown = null;

    try {
      rawData = JSON.parse(text);
    } catch {
      rawData = null;
    }

    const validationResult = clientErrorReportSchema.safeParse(rawData);

    if (!validationResult.success) {
      return json({ error: "Nieprawidłowe dane wejściowe", details: zodIssues(validationResult.error) }, 400);
    }

    // Ostrzeżenie, nie błąd: to relacja przeglądarki, której serwer nie potrafi sprawdzić.
    for (const event of validationResult.data.events) {
      logWarn(`client.${event.kind}`, {
        requestId: locals.requestId,
        userId: user.id,
        path: event.path,
        source: event.source,
        message: event.message,
        stack: event.stack,
        at: event.at,
      });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    logError("client_errors.post_failed", logContext, error);

    return json({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }, 500);
  }
};
