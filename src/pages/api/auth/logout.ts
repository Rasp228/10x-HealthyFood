import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  try {
    // Wylogowanie użytkownika przez Supabase Auth
    const { error } = await locals.supabase.auth.signOut();

    if (error) {
      console.error("Błąd Supabase podczas wylogowania:", error);
      return new Response(JSON.stringify({ error: "Wystąpił błąd podczas wylogowania" }), { status: 400 });
    }

    // Sukces - użytkownik został wylogowany. Ciasteczka kasujące sesję emituje samo `signOut()`,
    // a middleware dopisuje je do tej odpowiedzi - nagłówek Clear-Site-Data byłby z nimi w wyścigu.
    return new Response(JSON.stringify({ message: "Wylogowanie pomyślne" }), { status: 200 });
  } catch (error) {
    console.error("Błąd podczas wylogowania:", error);
    return new Response(JSON.stringify({ error: "Wystąpił błąd serwera" }), { status: 500 });
  }
};
