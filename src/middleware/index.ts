import { createSupabaseServerInstance } from "../db/supabase.client.ts";
import { defineMiddleware } from "astro:middleware";

// Public paths - Auth API endpoints & Server-Rendered Astro Pages
const PUBLIC_PATHS = [
  // Server-Rendered Astro Pages
  "/auth/login",
  "/auth/register",
  "/auth/reset-password",
  "/auth/change-password",
  "/auth/verify",
  // Auth API endpoints
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/auth/update-password",
  "/api/auth/me",
];

export const onRequest = defineMiddleware(async ({ locals, url, request, redirect }, next) => {
  // Jeden klient na żądanie. `flushCookies` musi objąć KAŻDE wyjście z middleware - to jedyny
  // moment, w którym wolno jeszcze dopisać Set-Cookie (patrz komentarz w supabase.client.ts).
  const { supabase, flushCookies } = createSupabaseServerInstance({
    headers: request.headers,
  });

  // Dodaj instancję Supabase do locals
  locals.supabase = supabase;

  // Handle auth codes BEFORE checking authentication status
  const code = url.searchParams.get("code");
  const authError = url.searchParams.get("error");

  if (code && url.pathname === "/auth/verify") {
    try {
      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Błąd podczas wymiany kodu:", error);
        // Clear any existing session and redirect with error
        await supabase.auth.signOut();
        const errorParam = encodeURIComponent(error.message);
        return flushCookies(redirect(`/auth/verify?error=${errorParam}`));
      }

      if (data.session) {
        // For password reset, always redirect to change password form
        // Add a success parameter to indicate successful code exchange
        return flushCookies(redirect("/auth/change-password?verified=true"));
      }
    } catch (error) {
      console.error("Błąd podczas przetwarzania kodu:", error);
      // Clear any existing session
      await supabase.auth.signOut();
      return flushCookies(redirect("/auth/verify?error=Wystąpił błąd podczas weryfikacji"));
    }
  }

  // Handle auth errors in URL
  if (authError && url.pathname === "/auth/verify") {
    // Clear any session and show error
    await supabase.auth.signOut();
    const errorMessage = url.searchParams.get("error_description") || "Wystąpił błąd podczas weryfikacji";
    return flushCookies(redirect(`/auth/verify?error=${encodeURIComponent(errorMessage)}`));
  }

  // Sesję rozstrzygamy zawsze, także na ścieżkach publicznych: jeśli access token wymaga rotacji,
  // nowe ciasteczka muszą powstać tutaj, zanim odpowiedź ruszy do przeglądarki. Dla gościa bez
  // ciasteczka sesji `getUser()` kończy się lokalnie, bez zapytania do Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && user.email) {
    locals.user = {
      email: user.email,
      id: user.id,
    };
  } else if (!PUBLIC_PATHS.includes(url.pathname)) {
    // Redirect to login for protected routes
    return flushCookies(redirect("/auth/login"));
  }

  return flushCookies(await next());
});
