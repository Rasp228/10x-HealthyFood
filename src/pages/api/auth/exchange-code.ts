import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return new Response(JSON.stringify({ error: "Kod autoryzacyjny jest wymagany" }), { status: 400 });
    }

    const supabase = createSupabaseServerInstance({
      cookies,
      headers: request.headers,
    });

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Błąd podczas wymiany kodu:", error);

      let errorMessage = "Nieprawidłowy lub wygasły kod autoryzacyjny";
      if (error.message.includes("expired")) {
        errorMessage = "Link resetowania hasła wygasł. Poproś o nowy link.";
      } else if (error.message.includes("invalid")) {
        errorMessage = "Nieprawidłowy link resetowania hasła.";
      }

      return new Response(JSON.stringify({ error: errorMessage }), { status: 400 });
    }

    if (!data.session) {
      return new Response(JSON.stringify({ error: "Nie udało się utworzyć sesji" }), { status: 400 });
    }

    return new Response(
      JSON.stringify({
        message: "Kod został pomyślnie wymieniony na sesję",
        session: {
          access_token: data.session.access_token,
          user: {
            id: data.session.user.id,
            email: data.session.user.email,
          },
        },
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Błąd podczas wymiany kodu:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
