import { z } from "zod";
import type { APIRoute } from "astro";
import { AIService } from "../../../lib/services/ai.service";

export const prerender = false;

// Schemat walidacji dla danych wejściowych
const generateRecipeSchema = z.object({
  additional_params: z.string().nullable().optional(),
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
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const command = {
      additional_params: validationResult.data.additional_params || null,
    };

    // Użyj serwisu AI do wygenerowania przepisu
    const aiService = new AIService(locals.supabase);
    const result = await aiService.generateRecipe(userId, command);

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Nie udało się wygenerować przepisu",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Zwróć wygenerowany przepis
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa błędów
    const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";

    // Ogólna obsługa innych błędów
    return new Response(
      JSON.stringify({
        error: "Błąd wewnętrzny serwera",
        details: errorMessage,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
