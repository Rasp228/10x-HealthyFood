import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";
import { registerSchema } from "../../../lib/validations/auth/register.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    // Walidacja danych wejściowych
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane",
          details: validationResult.error.errors,
        }),
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    const supabase = createSupabaseServerInstance({
      cookies,
      headers: request.headers,
    });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
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
    console.error("Błąd podczas rejestracji:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
