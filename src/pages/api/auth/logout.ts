import type { APIRoute } from "astro";
import { createSupabaseServerInstance } from "../../../db/supabase.client.ts";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    const supabase = createSupabaseServerInstance({
      cookies,
      headers: request.headers,
    });

    // Wylogowanie użytkownika przez Supabase Auth
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Błąd Supabase podczas wylogowania:", error);
      return new Response(JSON.stringify({ error: "Wystąpił błąd podczas wylogowania" }), { status: 400 });
    }

    // Sukces - użytkownik został wylogowany
    return new Response(JSON.stringify({ message: "Wylogowanie pomyślne" }), { status: 200 });
  } catch (error) {
    console.error("Błąd podczas wylogowania:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
