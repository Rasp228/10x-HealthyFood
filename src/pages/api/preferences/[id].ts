import type { APIRoute } from "astro";
import type { UpdatePreferenceCommand } from "../../../types";
import { positiveIdParamSchema } from "../../../lib/validations/common/id";
import { upsertPreferenceSchema } from "../../../lib/validations/preferences/upsert-preference";
import { zodIssues, type ValidationIssue } from "../../../lib/utils/validation-errors";

/** Kod Postgresa dla naruszenia unikatu - tu `preferences_unique_user_category_value`. */
const UNIQUE_VIOLATION = "23505";

/**
 * Identyfikator preferencji z `params.id`. Wspólna reguła kształtu i sufitu int4 (`id serial`):
 * `"12abc"` nie jest już czytane jako 12, a `"2147483648"` nie dociera do PostgREST.
 */
const preferenceIdSchema = positiveIdParamSchema({
  required: "Identyfikator preferencji jest wymagany",
  format: "Identyfikator preferencji musi być dodatnią liczbą całkowitą",
  invalid: "Nieprawidłowe ID preferencji",
});

const invalidIdResponse = (details: ValidationIssue[]) =>
  new Response(JSON.stringify({ error: "Nieprawidłowe ID preferencji", details }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

const internalErrorResponse = () =>
  new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
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

    const idResult = preferenceIdSchema.safeParse(params.id);

    if (!idResult.success) {
      return invalidIdResponse(zodIssues(idResult.error));
    }

    const preferenceId = idResult.data;

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera (wzorzec
    // `user-settings/index.ts`): `null` nie przechodzi schematu, więc odpowiada ta sama 400.
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

    const preference: UpdatePreferenceCommand = validationResult.data;

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

    // Zmiana na parę (kategoria, wartość), którą użytkownik już ma - konflikt, nie awaria.
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
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Error updating preference:", error);
    return internalErrorResponse();
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

    const idResult = preferenceIdSchema.safeParse(params.id);

    if (!idResult.success) {
      return invalidIdResponse(zodIssues(idResult.error));
    }

    const preferenceId = idResult.data;

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
    // Jak w PUT: do przeglądarki stała, do logu pełny błąd.
    console.error("Error deleting preference:", error);
    return internalErrorResponse();
  }
};
