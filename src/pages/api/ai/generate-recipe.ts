import { z } from "zod";
import type { APIRoute } from "astro";
import { AIResponseParseError, AIService } from "../../../lib/services/ai.service";
import { OpenRouterError } from "../../../lib/api/openrouter.types";
import type { AIErrorResponse, GeneratedRecipeDto } from "../../../types";
import { zodMessage } from "../../../lib/utils/validation-errors";

export const prerender = false;

// Schemat walidacji dla danych wejściowych
const generateRecipeSchema = z.object({
  additional_params: z.string().nullable().optional(),
  base_recipe: z.string().nullable().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
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

    const userId = user.id;

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = generateRecipeSchema.safeParse(rawData);

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

    const command = {
      additional_params: validationResult.data.additional_params || null,
      base_recipe: validationResult.data.base_recipe || null,
    };

    let result: GeneratedRecipeDto;

    try {
      // Konstrukcja serwisu w tym samym `try`, co wywołanie modelu: brak klucza rzuca
      // `OpenRouterError` z konstruktora i ma dać to samo 502, co klucz nieprawidłowy.
      const aiService = new AIService(locals.supabase);
      result = await aiService.generateRecipe(userId, command);
    } catch (error) {
      // Awaria dostawcy i nieczytelna odpowiedź modelu łapane PRZED zewnętrznym catchem - inaczej
      // byłyby nieodróżnialne od zwykłego 500 (wzorzec: `diary-entries/[id]/estimate.ts`).
      if (error instanceof OpenRouterError) {
        console.error("Błąd dostawcy AI podczas generowania przepisu:", error);
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
        console.error("Nieczytelna odpowiedź AI podczas generowania przepisu:", error);
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

    // Zwróć wygenerowany przepis
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Komunikat zostaje na serwerze: błąd bazy niesie nazwy tabel i polityk RLS - do przeglądarki
    // idzie stała, do logu pełny błąd.
    console.error("Błąd podczas generowania przepisu:", error);

    const errorResponse: AIErrorResponse = {
      error: "Błąd wewnętrzny serwera",
      code: "SERVER_ERROR",
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
