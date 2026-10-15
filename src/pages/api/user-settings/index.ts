import type { APIRoute } from "astro";
import type { DailyGoalDto } from "../../../types";
import { UserSettingsService } from "../../../lib/services/user-settings.service";
import { updateDailyGoalSchema } from "../../../lib/validations/user-settings/update-goal";
import { zodIssues } from "../../../lib/utils/validation-errors";
import { logError } from "../../../lib/utils/log";
import type { LogContext } from "../../../lib/utils/log";

export const prerender = false;

// Handler GET - dzienny cel kaloryczny użytkownika
export const GET: APIRoute = async ({ locals }) => {
  // Kontekst rośnie razem z tym, co trasa już wie - zewnętrzny catch loguje go w stanie z chwili
  // awarii.
  const logContext: LogContext = { requestId: locals.requestId, route: "user_settings.get" };

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

    logContext.userId = user.id;

    const userSettingsService = new UserSettingsService(locals.supabase);
    const result: DailyGoalDto = { daily_calorie_goal: await userSettingsService.getDailyGoal(user.id) };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Komunikat zostaje na serwerze - do przeglądarki idzie stała i `requestId`, po którym linię
    // logu z pełnym błędem da się znaleźć.
    logError("user_settings.get_failed", logContext, error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// Handler PUT - ustawienie albo wyczyszczenie (`null`) dziennego celu
export const PUT: APIRoute = async ({ request, locals }) => {
  const logContext: LogContext = { requestId: locals.requestId, route: "user_settings.put" };

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

    logContext.userId = user.id;
    logContext.goal = validationResult.data.daily_calorie_goal;

    const userSettingsService = new UserSettingsService(locals.supabase);
    const result: DailyGoalDto = {
      daily_calorie_goal: await userSettingsService.setDailyGoal(user.id, validationResult.data.daily_calorie_goal),
    };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    // Jak w GET: do przeglądarki stała i `requestId`, do logu pełny błąd.
    logError("user_settings.put_failed", logContext, error);

    return new Response(JSON.stringify({ error: "Błąd wewnętrzny serwera", requestId: locals.requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
