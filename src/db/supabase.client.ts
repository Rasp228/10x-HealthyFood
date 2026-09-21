import { stringifySetCookie } from "cookie";
import { createServerClient, type CookieOptions, type CookieOptionsWithName } from "@supabase/ssr";
import type { Database } from "./database.types.ts";

export const cookieOptions: CookieOptionsWithName = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
};

function parseCookieHeader(cookieHeader: string): { name: string; value: string }[] {
  return cookieHeader.split(";").map((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    return { name, value: rest.join("=") };
  });
}

/**
 * Tworzy request-scoped klienta Supabase wraz z funkcją, która dopisuje jego ciasteczka
 * na gotowej odpowiedzi.
 *
 * `@supabase/ssr` nie zapisuje ciasteczek w awaitowanym wywołaniu auth, tylko z listenera
 * `onAuthStateChange` (SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT). Ten listener potrafi
 * rozwiązać się w późniejszym ticku, więc zapis przez `Astro.cookies` kończył się wtedy
 * `ResponseSentError` - a zrotowany token nigdy nie docierał do przeglądarki. Dlatego
 * buforujemy wpisy i wypisujemy je jako `Set-Cookie` w middleware, dopóki odpowiedź jest
 * jeszcze w naszych rękach.
 */
export const createSupabaseServerInstance = (context: { headers: Headers }) => {
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let flushed = false;

  const supabase = createServerClient<Database>(import.meta.env.SUPABASE_URL, import.meta.env.SUPABASE_KEY, {
    cookieOptions,
    cookies: {
      getAll() {
        return parseCookieHeader(context.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        if (flushed) {
          // Odpowiedź już poszła - tego zapisu nie da się uratować, ale musi być widoczny:
          // przeglądarka zostaje ze starym refresh tokenem i kolejne żądanie znów będzie rotować.
          console.error(
            "Error setting cookies: zapis po wysłaniu odpowiedzi, ciasteczka przepadły:",
            cookiesToSet.map(({ name }) => name).join(", ")
          );
          return;
        }

        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const flushCookies = <T extends Response>(response: T): T => {
    // Mapa, nie tablica: jeden request potrafi wygenerować kilka zapisów tego samego ciasteczka
    // (np. kilka zdarzeń SIGNED_OUT pod rząd). Wygrywa ostatni, tak jak przy Astro.cookies.
    const byName = new Map<string, string>();

    for (const { name, value, options } of pendingCookies.splice(0)) {
      byName.set(name, stringifySetCookie({ ...options, name, value }));
    }

    for (const setCookie of byName.values()) {
      response.headers.append("Set-Cookie", setCookie);
    }

    flushed = true;

    return response;
  };

  return { supabase, flushCookies };
};
