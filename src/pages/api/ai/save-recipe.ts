import { z } from "zod";
import type { APIRoute } from "astro";

export const prerender = false;

// Schemat walidacji dla danych wejściowych
const saveRecipeSchema = z.object({
  recipe: z.object({
    title: z.string().min(1, "Tytuł jest wymagany"),
    content: z.string().min(1, "Treść przepisu jest wymagana"),
    additional_params: z.string().nullable().optional(),
  }),
  original_recipe_id: z.number().optional(),
  is_new: z.boolean(),
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

    // Pobierz i zwaliduj dane wejściowe
    const rawData = await request.json();
    const validationResult = saveRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { recipe, original_recipe_id, is_new } = validationResult.data;

    if (is_new) {
      // Tworzenie nowego przepisu
      const recipeData = {
        title: recipe.title,
        content: recipe.content,
        additional_params: recipe.additional_params ?? null,
        is_ai_generated: true,
        original_recipe_id: original_recipe_id ?? null,
        user_id: user.id,
      };

      const { data: newRecipe, error } = await locals.supabase.from("recipes").insert(recipeData).select().single();

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify(newRecipe), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Aktualizacja istniejącego przepisu
      if (!original_recipe_id) {
        return new Response(
          JSON.stringify({
            error: "ID oryginalnego przepisu jest wymagane dla aktualizacji",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Sprawdź czy przepis istnieje i należy do użytkownika
      const { data: existingRecipe, error: checkError } = await locals.supabase
        .from("recipes")
        .select("id")
        .eq("id", original_recipe_id)
        .eq("user_id", user.id)
        .single();

      if (checkError || !existingRecipe) {
        return new Response(
          JSON.stringify({
            error: "Przepis nie został znaleziony",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Aktualizuj przepis
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
        .eq("id", original_recipe_id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return new Response(JSON.stringify(updatedRecipe), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    // Obsługa błędów
    const errorMessage = error instanceof Error ? error.message : "Nieznany błąd";

    return new Response(
      JSON.stringify({
        error: "Błąd wewnętrzny serwera",
        details: errorMessage,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
