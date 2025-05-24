import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";
import { loginSchema } from "../../../lib/validations/auth/login.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    // Walidacja danych wejściowych
    const validationResult = loginSchema.safeParse(body);
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
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
    console.error("Błąd podczas logowania:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
