import { z } from "zod";
import type { APIRoute } from "astro";

export const prerender = false;

// Schemat walidacji dla danych wejściowych do tworzenia przepisu
const createRecipeSchema = z.object({
  title: z.string().min(1, "Tytuł jest wymagany"),
  content: z.string().min(1, "Treść przepisu jest wymagana"),
  additional_params: z.string().nullable().optional(),
  is_ai_generated: z.boolean().optional().default(false),
});

// Schemat walidacji dla parametrów paginacji i sortowania
const paginationSchema = z.object({
  limit: z.coerce.number().optional(),
  offset: z.coerce.number().optional(),
  sort: z.enum(["created_at", "updated_at", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  search: z.string().optional(),
});

// Handler GET - pobieranie listy przepisów
export const GET: APIRoute = async ({ locals, url }) => {
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

    // Pobierz i zwaliduj parametry paginacji i sortowania
    const params = Object.fromEntries(url.searchParams.entries());
    const validationResult = paginationSchema.safeParse(params);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe parametry",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { limit = 10, offset = 0, sort = "created_at", order = "desc", search } = validationResult.data;

    // Budowanie zapytania z wyszukiwaniem
    let query = locals.supabase.from("recipes").select("*", { count: "exact" }).eq("user_id", user.id);

    // Dodanie wyszukiwania jeśli podano
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      query = query.or(
        `title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,additional_params.ilike.%${searchTerm}%`
      );
    }

    // Sortowanie i paginacja
    query = query.order(sort, { ascending: order === "asc" }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw error;
    }

    // Zwróć listę przepisów w formacie zgodnym z PaginatedRecipesDto
    const result = {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };

    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
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

// Handler POST - tworzenie nowego przepisu
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
    const validationResult = createRecipeSchema.safeParse(rawData);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({
          error: "Nieprawidłowe dane wejściowe",
          details: validationResult.error.format(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Przygotuj dane do utworzenia przepisu
    const recipeData = {
      title: validationResult.data.title,
      content: validationResult.data.content,
      additional_params: validationResult.data.additional_params ?? null,
      is_ai_generated: validationResult.data.is_ai_generated,
      user_id: user.id,
    };

    // Utwórz przepis w bazie danych
    const { data, error } = await locals.supabase.from("recipes").insert(recipeData).select().single();

    if (error) {
      throw error;
    }

    // Zwróć utworzony przepis
    return new Response(JSON.stringify(data), { status: 201, headers: { "Content-Type": "application/json" } });
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
