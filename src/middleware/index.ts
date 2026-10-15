import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { createSupabaseServerInstance } from "../db/supabase.client.ts";
import { logError, logWarn } from "../lib/utils/log.ts";
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
  // Identyfikator żądania jako pierwszy: łączy linię logu z wierszem żądania w panelu Vercela
  // (`x-vercel-id`), a lokalnie i w testach - z losowym UUID.
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  locals.requestId = requestId;

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
      // Kodowanie konieczne: `redirect` wkłada ścieżkę do `Location` bez kodowania, a „ą” spoza
      // Latin-1 wywraca konstruktor `Headers` - zamiast przekierowania byłoby 500 bez ciasteczek.
      const errorParam = encodeURIComponent("Wystąpił błąd podczas weryfikacji");
      return flushCookies(redirect(`/auth/verify?error=${errorParam}`));
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
    error: userError,
  } = await supabase.auth.getUser();

  // Brak sesji (`AuthSessionMissingError`) to zwykły gość, nie błąd - nie logujemy go. Odrzucony
  // token (`AuthApiError` 4xx) to ostrzeżenie; reszta (5xx GoTrue, sieć) to awaria, która inaczej
  // wyglądałaby jak ciche wylogowanie. Decyzja dostępu poniżej zostaje bez zmian.
  if (userError && !isAuthSessionMissingError(userError)) {
    const context = { requestId, path: url.pathname, method: request.method };

    if (isAuthApiError(userError) && userError.status >= 400 && userError.status < 500) {
      logWarn("auth.session_invalid", context, userError);
    } else {
      logError("auth.get_user_failed", context, userError);
    }
  }

  if (user && user.email) {
    locals.user = {
      email: user.email,
      id: user.id,
    };
  } else if (!PUBLIC_PATHS.includes(url.pathname)) {
    // Redirect to login for protected routes
    return flushCookies(redirect("/auth/login"));
  }

  try {
    return flushCookies(await next());
  } catch (error) {
    logError(
      "request.unhandled",
      { requestId, path: url.pathname, method: request.method, userId: locals.user?.id },
      error
    );

    // Trasa API dostaje 500 JSON z `requestId` - przez `flushCookies`, żeby wyjątek nie zgubił
    // zrotowanego tokenu. Strona rzuca dalej, żeby Astro wyrenderowało swoją stronę błędu.
    if (url.pathname.startsWith("/api/")) {
      return flushCookies(
        new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    throw error;
  }
});
