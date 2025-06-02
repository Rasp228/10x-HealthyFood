import { z } from "zod";
import type { APIRoute } from "astro";

export const prerender = false;

// Schemat walidacji dla danych wejściowych zgodny z PRD
const saveRecipeSchema = z.object({
  recipe: z.object({
    title: z.string().min(1, "Tytuł jest wymagany").max(100, "Tytuł nie może przekraczać 100 znaków"),
    content: z
      .string()
      .min(1, "Treść przepisu jest wymagana")
      .max(5000, "Treść przepisu nie może przekraczać 5000 znaków"),
    additional_params: z
      .string()
      .max(5000, "Dodatkowe parametry nie mogą przekraczać 5000 znaków")
      .nullable()
      .optional(),
  }),
  is_new: z.boolean(),
  replace_existing: z
    .object({
      recipe_id: z.number(),
      replace: z.boolean(),
    })
    .optional(),
});

// Typy błędów AI zgodne z planem
interface AIErrorResponse {
  error: string;
  code: "INVALID_INPUT" | "RECIPE_NOT_FOUND" | "UNAUTHORIZED" | "SERVER_ERROR";
  details?: string;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Sprawdź autoryzację
    const {
      data: { user },
    } = await locals.supabase.auth.getUser();

    if (!user) {
      const errorResponse: AIErrorResponse = {
        error: "Nieautoryzowany dostęp",
        code: "UNAUTHORIZED",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pobierz i zwaliduj dane wejściowe
    let rawData;
    try {
      rawData = await request.json();
    } catch {
      const errorResponse: AIErrorResponse = {
        error: "Nieprawidłowy format JSON",
        code: "INVALID_INPUT",
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validationResult = saveRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      const errorResponse: AIErrorResponse = {
        error: "Nieprawidłowe dane wejściowe",
        code: "INVALID_INPUT",
        details: validationResult.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { recipe, is_new, replace_existing } = validationResult.data;

    // Sprawdź czy chcemy zastąpić istniejący przepis
    if (!is_new && replace_existing?.replace) {
      // Sprawdź czy przepis istnieje i należy do użytkownika
      const { data: existingRecipe, error: checkError } = await locals.supabase
        .from("recipes")
        .select("id")
        .eq("id", replace_existing.recipe_id)
        .eq("user_id", user.id)
        .single();

      if (checkError || !existingRecipe) {
        const errorResponse: AIErrorResponse = {
          error: "Przepis do zastąpienia nie został znaleziony lub nie masz do niego uprawnień",
          code: "RECIPE_NOT_FOUND",
          details: `Przepis o ID ${replace_existing.recipe_id} nie istnieje lub nie należy do Ciebie`,
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Aktualizuj istniejący przepis
      const updateData = {
        title: recipe.title,
        content: recipe.content,
        additional_params: recipe.additional_params ?? null,
        is_ai_generated: true,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRecipe, error: updateError } = await locals.supabase
        .from("recipes")
        .update(updateData)
        .eq("id", replace_existing.recipe_id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        console.error("Błąd podczas aktualizacji przepisu:", updateError);
        const errorResponse: AIErrorResponse = {
          error: "Nie udało się zaktualizować przepisu",
          code: "SERVER_ERROR",
          details: updateError.message,
        };
        return new Response(JSON.stringify(errorResponse), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(updatedRecipe), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Tworzenie nowego przepisu (domyślne zachowanie)
    const recipeData = {
      title: recipe.title,
      content: recipe.content,
      additional_params: recipe.additional_params ?? null,
      is_ai_generated: true,
      user_id: user.id,
    };

    const { data: newRecipe, error } = await locals.supabase.from("recipes").insert(recipeData).select().single();

    if (error) {
      console.error("Błąd podczas tworzenia przepisu:", error);
      const errorResponse: AIErrorResponse = {
        error: "Nie udało się utworzyć przepisu",
        code: "SERVER_ERROR",
        details: error.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(newRecipe), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Obsługa nieoczekiwanych błędów
    const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";
    console.error("Nieoczekiwany błąd w save-recipe:", error);

    const errorResponse: AIErrorResponse = {
      error: "Błąd wewnętrzny serwera",
      code: "SERVER_ERROR",
      details: errorMessage,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
