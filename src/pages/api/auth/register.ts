import type { APIRoute } from "astro";
import { registerSchema } from "../../../lib/validations/auth/register.ts";
import { zodIssues } from "../../../lib/utils/validation-errors.ts";
import { authServiceFailure } from "../../../lib/utils/auth-errors.ts";
import { logError } from "../../../lib/utils/log.ts";
import type { LogContext } from "../../../lib/utils/log.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "auth.register" };

  try {
    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera (wzorzec tras dziennika):
    // `null` nie przechodzi schematu, więc odpowiada ta sama 400.
    const body = await request.json().catch(() => null);

    // Walidacja danych wejściowych
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane",
          details: zodIssues(validationResult.error),
        }),
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    const { data, error } = await locals.supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      // Awaria GoTrue (sieć, 5xx) albo limit prób to nie błąd danych - własny status i linia w logu.
      const failure = authServiceFailure(error, { ...logContext, step: "signUp" });
      if (failure) return failure;

      let errorMessage = "Wystąpił błąd podczas rejestracji.";

      if (error.message.includes("User already registered")) {
        errorMessage = "Email już zarejestrowany w systemie.";
      } else if (error.message.includes("Password should be")) {
        errorMessage = "Zbyt słabe hasło. Hasło musi spełniać wymagania bezpieczeństwa.";
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: error.message.includes("User already registered") ? 409 : 400,
      });
    }

    // Sprawdzenie czy użytkownik wymaga weryfikacji email
    if (data.user && !data.session) {
      return new Response(
        JSON.stringify({
          message: "Rejestracja pomyślna. Sprawdź swoją skrzynkę pocztową i kliknij link weryfikacyjny.",
          requiresVerification: true,
          user: {
            id: data.user.id,
            email: data.user.email,
          },
        }),
        { status: 201 }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Rejestracja pomyślna",
        user: {
          id: data.user?.id,
          email: data.user?.email,
        },
      }),
      { status: 201 }
    );
  } catch (error) {
    logError("auth.register_failed", logContext, error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera", requestId: locals.requestId }), {
      status: 500,
    });
  }
};
