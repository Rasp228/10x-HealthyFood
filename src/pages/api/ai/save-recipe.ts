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
  is_new: z.boolean(),
  replace_existing: z
    .object({
      recipe_id: z.number(),
      replace: z.boolean(),
    })
    .optional(),
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
        return new Response(
          JSON.stringify({
            error: "Przepis do zastąpienia nie został znaleziony",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
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
        throw updateError;
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
      throw error;
    }

    return new Response(JSON.stringify(newRecipe), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
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
