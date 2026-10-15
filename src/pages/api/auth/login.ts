import type { APIRoute } from "astro";
import { loginSchema } from "../../../lib/validations/auth/login.ts";
import { zodIssues } from "../../../lib/utils/validation-errors.ts";
import { authServiceFailure } from "../../../lib/utils/auth-errors.ts";
import { logError } from "../../../lib/utils/log.ts";
import type { LogContext } from "../../../lib/utils/log.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "auth.login" };

  try {
    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera (wzorzec tras dziennika):
    // `null` nie przechodzi schematu, więc odpowiada ta sama 400.
    const body = await request.json().catch(() => null);

    // Walidacja danych wejściowych
    const validationResult = loginSchema.safeParse(body);
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

    const { data, error } = await locals.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Awaria GoTrue (sieć, 5xx) albo limit prób to nie „złe hasło” - własny status i linia w logu.
      const failure = authServiceFailure(error, { ...logContext, step: "signInWithPassword" });
      if (failure) return failure;

      let errorMessage = "Nieprawidłowy email lub hasło. Spróbuj ponownie.";

      if (error.message.includes("Email not confirmed")) {
        errorMessage = "Email nie został zweryfikowany. Sprawdź swoją skrzynkę pocztową.";
      } else if (error.message.includes("Invalid login credentials")) {
        errorMessage = "Nieprawidłowy email lub hasło.";
      }

      return new Response(JSON.stringify({ error: errorMessage }), { status: 401 });
    }

    return new Response(
      JSON.stringify({
        message: "Logowanie pomyślne",
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      }),
      { status: 200 }
    );
  } catch (error) {
    logError("auth.login_failed", logContext, error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera", requestId: locals.requestId }), {
      status: 500,
    });
  }
};
