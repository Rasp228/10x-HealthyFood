import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";
import { z } from "zod";

export const prerender = false;

// Schemat walidacji dla aktualizacji hasła
const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Hasło musi mieć co najmniej 8 znaków")
      .regex(/\d/, "Hasło musi zawierać co najmniej jedną cyfrę")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Hasło musi zawierać co najmniej jeden znak specjalny"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    // Walidacja danych wejściowych
    const validationResult = updatePasswordSchema.safeParse(body);
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

    const supabase = createSupabaseServerInstance({
      cookies,
      headers: request.headers,
    });

    // Sprawdź czy użytkownik jest zalogowany
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Musisz być zalogowany aby zmienić hasło" }), { status: 401 });
    }

    // Aktualizuj hasło
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      console.error("Błąd podczas aktualizacji hasła:", error);

      let errorMessage = "Wystąpił błąd podczas ustawiania nowego hasła.";

      if (error.message.includes("same as the old password")) {
        errorMessage = "Nowe hasło musi się różnić od poprzedniego.";
      } else if (error.message.includes("Password should be")) {
        errorMessage = "Hasło nie spełnia wymagań bezpieczeństwa.";
      } else if (error.message.includes("session_not_found")) {
        errorMessage = "Sesja wygasła. Zaloguj się ponownie.";
      }

      return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
    }

    return new Response(
      JSON.stringify({
        message: "Hasło zostało pomyślnie zmienione.",
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Błąd podczas aktualizacji hasła:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
