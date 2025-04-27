import type {
  CreateRecipeCommand,
  PaginatedRecipesDto,
  PaginationParams,
  RecipeDto,
  RecipeSortParams,
  UpdateRecipeCommand,
} from "../../types";
import { supabaseClient } from "../../db/supabase.client";

/**
 * Serwis obsługujący zarządzanie przepisami kulinarnymi
 */
export class RecipeService {
  /**
   * Pobiera listę przepisów użytkownika z paginacją i sortowaniem
   * @param userId - ID użytkownika
   * @param pagination - Parametry paginacji (limit, offset)
   * @param sort - Parametry sortowania (sort, order)
   * @returns Paginowana lista przepisów
   */
  async getUserRecipes(
    userId: string,
    pagination: PaginationParams = {},
    sort: RecipeSortParams = {}
  ): Promise<PaginatedRecipesDto> {
    const { limit = 10, offset = 0 } = pagination;
    const { sort: sortField = "created_at", order = "desc" } = sort;

    const query = supabaseClient
      .from("recipes")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order(sortField, { ascending: order === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Błąd podczas pobierania przepisów: ${error.message}`);
    }

    return {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Pobiera pojedynczy przepis
   * @param recipeId - ID przepisu
   * @param userId - ID użytkownika (opcjonalne, dla walidacji właściciela)
   * @returns Przepis lub null jeśli nie znaleziono
   */
  async getRecipe(recipeId: number, userId?: string): Promise<RecipeDto | null> {
    let query = supabaseClient.from("recipes").select("*").eq("id", recipeId);

    // Jeśli podano userId, sprawdź czy przepis należy do użytkownika
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === "PGRST116") {
        // Nie znaleziono przepisu
        return null;
      }
      throw new Error(`Błąd podczas pobierania przepisu: ${error.message}`);
    }

    return data;
  }

  /**
   * Tworzy nowy przepis
   * @param userId - ID użytkownika
   * @param command - Dane do utworzenia przepisu
   * @returns Utworzony przepis
   */
  async createRecipe(userId: string, command: CreateRecipeCommand): Promise<RecipeDto> {
    const { data, error } = await supabaseClient
      .from("recipes")
      .insert({
        user_id: userId,
        title: command.title,
        content: command.content,
        additional_params: command.additional_params,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Błąd podczas tworzenia przepisu: ${error.message}`);
    }

    return data;
  }

  /**
   * Aktualizuje istniejący przepis
   * @param recipeId - ID przepisu do aktualizacji
   * @param userId - ID użytkownika (dla weryfikacji właściciela)
   * @param command - Dane do aktualizacji przepisu
   * @returns Zaktualizowany przepis lub null jeśli nie znaleziono
   */
  async updateRecipe(recipeId: number, userId: string, command: UpdateRecipeCommand): Promise<RecipeDto | null> {
    // Najpierw sprawdź czy przepis istnieje i należy do użytkownika
    const existingRecipe = await this.getRecipe(recipeId, userId);
    if (!existingRecipe) {
      return null;
    }

    const { data, error } = await supabaseClient
      .from("recipes")
      .update({
        title: command.title,
        content: command.content,
        additional_params: command.additional_params,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipeId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Błąd podczas aktualizacji przepisu: ${error.message}`);
    }

    return data;
  }

  /**
   * Usuwa przepis
   * @param recipeId - ID przepisu do usunięcia
   * @param userId - ID użytkownika (dla weryfikacji właściciela)
   * @returns true jeśli usunięto, false jeśli nie znaleziono
   */
  async deleteRecipe(recipeId: number, userId: string): Promise<boolean> {
    // Najpierw sprawdź czy przepis istnieje i należy do użytkownika
    const existingRecipe = await this.getRecipe(recipeId, userId);
    if (!existingRecipe) {
      return false;
    }

    const { error } = await supabaseClient.from("recipes").delete().eq("id", recipeId).eq("user_id", userId);

    if (error) {
      throw new Error(`Błąd podczas usuwania przepisu: ${error.message}`);
    }

    return true;
  }
}
