import type { APIRoute } from "astro";
import { z } from "zod";
import type { CreatePreferenceCommand, PaginatedPreferencesDto, PreferenceCategoryEnum } from "../../../types";

// Schemat walidacji dla nowej preferencji
const preferenceSchema = z.object({
  category: z.enum(["lubiane", "nielubiane", "wykluczone", "diety"] as const),
  value: z.string().min(1).max(50),
});

// Schemat walidacji dla parametrów zapytania
const querySchema = z.object({
  category: z.enum(["lubiane", "nielubiane", "wykluczone", "diety"] as const).optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
  offset: z.coerce.number().min(0).optional(),
});

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

    // Walidacja parametrów zapytania
    const validatedParams = querySchema.parse(queryParams);
    const { category, limit = 50, offset = 0 } = validatedParams;

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

    const response: PaginatedPreferencesDto = {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Wystąpił błąd serwera",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
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

    const body = await request.json();

    // Walidacja danych wejściowych
    const validatedData = preferenceSchema.parse(body);
    const preference: CreatePreferenceCommand = {
      category: validatedData.category as PreferenceCategoryEnum,
      value: validatedData.value,
    };

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
    console.error("Error creating preference:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Wystąpił błąd serwera",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
