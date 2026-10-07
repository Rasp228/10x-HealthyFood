import type { APIRoute } from "astro";
import type { CreatePreferenceCommand, PreferencesDto } from "../../../types";
import { listPreferencesSchema } from "../../../lib/validations/preferences/list-preferences";
import { upsertPreferenceSchema } from "../../../lib/validations/preferences/upsert-preference";
import { zodIssues } from "../../../lib/utils/validation-errors";

/** Kod Postgresa dla naruszenia unikatu - tu `preferences_unique_user_category_value`. */
const UNIQUE_VIOLATION = "23505";

export const prerender = false;

// GET /api/preferences
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { supabase } = locals;

    // Pobierz token sesji
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
      });
    }

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    // Walidacja parametrów zapytania - zły parametr to błąd wejścia (400), nie awaria serwera.
    const validationResult = listPreferencesSchema.safeParse(queryParams);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe parametry zapytania",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { category, limit = 50, offset = 0 } = validationResult.data;

    // Przygotuj zapytanie
    let query = supabase
      .from("preferences")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Dodaj filtr kategorii jeśli podano
    if (category) {
      query = query.eq("category", category);
    }

    // Wykonaj zapytanie
    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    const response: PreferencesDto = {
      data: data || [],
      total: count || 0,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Error fetching preferences:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST /api/preferences
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { supabase } = locals;

    // Pobierz token sesji
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
      });
    }

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera: bez tego `catch`
    // wyjątek z `request.json()` trafiłby do zewnętrznego catcha i wróciłby jako 500. `null` nie
    // przechodzi schematu, więc odpowiada ta sama 400.
    const rawData = await request.json().catch(() => null);
    const validationResult = upsertPreferenceSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const preference: CreatePreferenceCommand = validationResult.data;

    // Sprawdź limit preferencji
    const { count } = await supabase.from("preferences").select("*", { count: "exact" }).eq("user_id", user.id);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({
          error: "Osiągnięto maksymalną liczbę preferencji (50)",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Dodaj preferencję
    const { data, error } = await supabase
      .from("preferences")
      .insert([
        {
          ...preference,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    // Ta sama para (kategoria, wartość) u tego użytkownika - konflikt z istniejącym zasobem,
    // nie awaria. Wartość jest już po `trim()`, więc „ wega ” trafia na zapisane „wega”.
    if (error?.code === UNIQUE_VIOLATION) {
      return new Response(JSON.stringify({ error: "Taka preferencja już istnieje" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(data), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // Komunikat zostaje na serwerze. Błąd PostgREST niesie nazwy kolumn i ograniczeń - do
    // przeglądarki idzie stała, do logu pełny błąd.
    console.error("Error creating preference:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
