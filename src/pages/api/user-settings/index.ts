import type { APIRoute } from "astro";
import type { DailyGoalDto } from "../../../types";
import { UserSettingsService } from "../../../lib/services/user-settings.service";
import { updateDailyGoalSchema } from "../../../lib/validations/user-settings/update-goal";
import { zodIssues } from "../../../lib/utils/validation-errors";

export const prerender = false;

// Handler GET - dzienny cel kaloryczny użytkownika
export const GET: APIRoute = async ({ locals }) => {
  try {
    // Sprawdź autoryzację. Żądanie bez sesji zwykle nie dociera tutaj - middleware przekierowuje
    // ścieżki spoza PUBLIC_PATHS na /auth/login - ale 401 zostaje jako druga linia obrony.
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userSettingsService = new UserSettingsService(locals.supabase);
    const result: DailyGoalDto = { daily_calorie_goal: await userSettingsService.getDailyGoal(user.id) };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała, do logu pełny błąd.
    console.error("Błąd podczas odczytu celu dziennego:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Handler PUT - ustawienie albo wyczyszczenie (`null`) dziennego celu
export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    // Druga linia obrony za middleware, tak jak w GET.
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Body, które nie jest JSON-em, to błąd wejścia, a nie awaria serwera: bez tego `catch`
    // wyjątek z `request.json()` trafiłby do zewnętrznego catcha i wróciłby jako 500. `null` nie
    // przechodzi schematu, więc odpowiada ta sama 400.
    const rawData = await request.json().catch(() => null);
    const validationResult = updateDailyGoalSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: zodIssues(validationResult.error),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userSettingsService = new UserSettingsService(locals.supabase);
    const result: DailyGoalDto = {
      daily_calorie_goal: await userSettingsService.setDailyGoal(user.id, validationResult.data.daily_calorie_goal),
    };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Jak w GET: do przeglądarki stała, do logu pełny błąd.
    console.error("Błąd podczas zapisu celu dziennego:", error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
