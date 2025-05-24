import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";
import { requestResetSchema, confirmResetSchema } from "../../../lib/validations/auth/reset-password.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  try {
    const body = await request.json();

    const supabase = createSupabaseServerInstance({
      cookies,
      headers: request.headers,
    });

    // Sprawdzenie czy to żądanie resetu (przez email) czy ustawienie nowego hasła
    if (body.email && !body.token) {
      // Etap 1: Żądanie resetu hasła
      const validationResult = requestResetSchema.safeParse(body);
      if (!validationResult.success) {
        return new Response(
          JSON.stringify({
            error: "Nieprawidłowe dane",
            details: validationResult.error.errors,
          }),
          { status: 400 }
        );
      }

      const { email } = validationResult.data;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${url.origin}/auth/reset-password?step=confirm`,
      });

      if (error) {
        console.error("Błąd podczas żądania resetu hasła:", error);
        return new Response(JSON.stringify({ error: "Wystąpił błąd podczas wysyłania linku resetującego" }), {
          status: 400,
        });
      }

      return new Response(
        JSON.stringify({
          message: "Link resetujący hasło został wysłany na Twój adres email.",
        }),
        { status: 200 }
      );
    } else if (body.token && body.password) {
      // Etap 2: Ustawienie nowego hasła
      const validationResult = confirmResetSchema.safeParse(body);
      if (!validationResult.success) {
        return new Response(
          JSON.stringify({
            error: "Nieprawidłowe dane",
            details: validationResult.error.errors,
          }),
          { status: 400 }
        );
      }

      const { password } = validationResult.data;

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        let errorMessage = "Wystąpił błąd podczas ustawiania nowego hasła.";

        if (error.message.includes("same as the old password")) {
          errorMessage = "Nowe hasło musi się różnić od poprzedniego.";
        } else if (error.message.includes("Password should be")) {
          errorMessage = "Hasło nie spełnia wymagań bezpieczeństwa.";
        }

        return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
      }

      return new Response(
        JSON.stringify({
          message: "Hasło zostało pomyślnie zmienione. Możesz się teraz zalogować.",
        }),
        { status: 200 }
      );
    } else {
      return new Response(JSON.stringify({ error: "Nieprawidłowe parametry żądania" }), { status: 400 });
    }
  } catch (error) {
    console.error("Błąd podczas resetowania hasła:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
