import type { APIRoute } from "astro";
import { z } from "zod";
import type { UpdatePreferenceCommand } from "../../../types";

// Schemat walidacji dla aktualizacji preferencji
const preferenceSchema = z.object({
  category: z.enum(["lubiane", "nielubiane", "wykluczone", "diety"] as const),
  value: z.string().min(1).max(50),
});

export const prerender = false;

// PUT /api/preferences/[id]
export const PUT: APIRoute = async ({ params, request, locals }) => {
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

    const preferenceId = parseInt(params.id || "0", 10);

    if (isNaN(preferenceId) || preferenceId <= 0) {
      return new Response(JSON.stringify({ error: "Nieprawidłowe ID preferencji" }), {
        status: 400,
      });
    }

    const body = await request.json();
    const validatedData = preferenceSchema.parse(body);
    const preference: UpdatePreferenceCommand = {
      category: validatedData.category,
      value: validatedData.value,
    };

    // Sprawdź czy preferencja należy do użytkownika
    const { data: existingPreference, error: fetchError } = await supabase
      .from("preferences")
      .select("*")
      .eq("id", preferenceId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingPreference) {
      return new Response(JSON.stringify({ error: "Nie znaleziono preferencji" }), {
        status: 404,
      });
    }

    // Aktualizuj preferencję
    const { data, error } = await supabase
      .from("preferences")
      .update({
        category: preference.category,
        value: preference.value,
      })
      .eq("id", preferenceId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error updating preference:", error);
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

// DELETE /api/preferences/[id]
export const DELETE: APIRoute = async ({ params, locals }) => {
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

    const preferenceId = parseInt(params.id || "0", 10);

    if (isNaN(preferenceId) || preferenceId <= 0) {
      return new Response(JSON.stringify({ error: "Nieprawidłowe ID preferencji" }), {
        status: 400,
      });
    }

    // Sprawdź czy preferencja należy do użytkownika
    const { data: existingPreference, error: fetchError } = await supabase
      .from("preferences")
      .select("*")
      .eq("id", preferenceId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !existingPreference) {
      return new Response(JSON.stringify({ error: "Nie znaleziono preferencji" }), {
        status: 404,
      });
    }

    // Usuń preferencję
    const { error } = await supabase.from("preferences").delete().eq("id", preferenceId).eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return new Response(null, {
      status: 204,
    });
  } catch (error) {
    console.error("Error deleting preference:", error);
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
