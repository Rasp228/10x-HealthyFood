import { z } from "zod";
import type { APIRoute } from "astro";
import { AIResponseParseError, AIService } from "../../../lib/services/ai.service";
import { OpenRouterError } from "../../../lib/api/openrouter.types";
import type { AIErrorResponse, ModifiedRecipeDto } from "../../../types";
import { zodMessage } from "../../../lib/utils/validation-errors";
import { logError } from "../../../lib/utils/log";
import type { LogContext } from "../../../lib/utils/log";
import { dbError } from "../../../lib/utils/db-error";

export const prerender = false;

// Schemat walidacji dla danych wejściowych
const modifyRecipeSchema = z.object({
  additional_params: z.string().min(1, "Parametry modyfikacji są wymagane"),
  base_recipe: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  // Kontekst rośnie razem z tym, co trasa już wie - zewnętrzny catch loguje go w stanie z chwili
  // awarii.
  const logContext: LogContext = { requestId: locals.requestId, route: "ai.modify_recipe" };

  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Nieautoryzowany dostęp",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = modifyRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      const errorResponse: AIErrorResponse = {
        error: "Nieprawidłowe dane wejściowe",
        code: "INVALID_INPUT",
        details: zodMessage(validationResult.error),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz ID przepisu z danych wejściowych (zamiast z URL)
    const recipeId = rawData.recipe_id;
    if (!recipeId || isNaN(parseInt(recipeId)) || parseInt(recipeId) <= 0) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe ID przepisu",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parsedRecipeId = parseInt(recipeId);
    logContext.userId = user.id;
    logContext.recipeId = parsedRecipeId;

    // Sprawdź czy przepis istnieje i należy do użytkownika
    const { data: recipe, error: recipeError } = await locals.supabase
      .from("recipes")
      .select("*")
      .eq("id", parsedRecipeId)
      .eq("user_id", user.id)
      .single();

    // 404 tylko dla braku wiersza (`PGRST116` z `.single()`). Każdy inny błąd odczytu - RLS,
    // sieć, PostgREST - to awaria, która ma trafić do logu i dać 500, a nie udawać cudzy przepis.
    if (recipeError && recipeError.code !== "PGRST116") {
      throw dbError(recipeError, "modifyRecipe.lookup");
    }

    if (recipeError || !recipe) {
      return new Response(
        JSON.stringify({
          error: "Przepis nie został znaleziony",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const command = {
      additional_params: validationResult.data.additional_params,
      base_recipe: validationResult.data.base_recipe || JSON.stringify(recipe),
    };

    let result: ModifiedRecipeDto;

    try {
      // Konstrukcja serwisu w tym samym `try`, co wywołanie modelu: brak klucza rzuca
      // `OpenRouterError` z konstruktora i ma dać to samo 502, co klucz nieprawidłowy.
      const aiService = new AIService(locals.supabase);
      result = await aiService.modifyRecipe(user.id, parsedRecipeId, command);
    } catch (error) {
      // Mapowanie jak w `generate-recipe.ts` i `diary-entries/[id]/estimate.ts`.
      if (error instanceof OpenRouterError) {
        // Status i model w linii logu odróżniają 401 (klucz) od 429 (limit) i 404 (model).
        logError(
          "ai.provider_failed",
          {
            requestId: locals.requestId,
            userId: user.id,
            route: "ai.modify_recipe",
            model: error.model,
            status: error.status,
          },
          error
        );
        const errorResponse: AIErrorResponse = {
          error: "Usługa AI jest chwilowo niedostępna",
          code: "AI_UNAVAILABLE",
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (error instanceof AIResponseParseError) {
        logError("ai.response_unparseable", logContext, error);
        const errorResponse: AIErrorResponse = {
          error: "AI zwróciło odpowiedź, której nie da się odczytać",
          code: "AI_PARSE_ERROR",
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw error;
    }

    // Zwróć zmodyfikowany przepis
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Komunikat zostaje na serwerze: błąd bazy niesie nazwy tabel i polityk RLS - do przeglądarki
    // idzie stała i `requestId`, po którym linię logu z pełnym błędem da się znaleźć.
    logError("ai.modify_recipe_failed", logContext, error);

    const errorResponse: AIErrorResponse = {
      error: "Błąd wewnętrzny serwera",
      code: "SERVER_ERROR",
      requestId: locals.requestId,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
