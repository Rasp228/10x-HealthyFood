import type { Database, Tables } from "./db/database.types";

/**
 * Podstawowe DTO odpowiadające encjom bazy danych
 */

// Typ preferencji z bazy danych
export type PreferenceDto = Tables<"preferences">;

// Typ przepisu z bazy danych
export interface RecipeDto extends Tables<"recipes"> {
  ai_generated?: boolean;
  original_recipe_id?: number | null;
}

// Typ logu z bazy danych
export type LogDto = Tables<"logs">;

/**
 * Parametry paginacji i sortowania
 */

// Parametry paginacji dla list
export interface PaginationParams {
  limit?: number;
  offset?: number;
  category?: PreferenceCategoryEnum;
}

// Parametry sortowania dla list przepisów
export interface RecipeSortParams {
  sort?: "created_at" | "updated_at" | "title";
  order?: "asc" | "desc";
}

/**
 * Command Models do tworzenia i aktualizacji danych
 */

// Command do tworzenia/aktualizacji preferencji
export interface CreatePreferenceCommand {
  category: PreferenceCategoryEnum;
  value: string;
}

// Command do aktualizacji preferencji
export type UpdatePreferenceCommand = CreatePreferenceCommand;

// Command do tworzenia/aktualizacji przepisu
export type CreateRecipeCommand = Pick<RecipeDto, "title" | "content" | "additional_params">;
export type UpdateRecipeCommand = CreateRecipeCommand;

/**
 * DTO z paginacją
 */

// Interfejs generyczny dla odpowiedzi z paginacją
export interface PaginatedResponseDto<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Odpowiedź z listą preferencji i paginacją
export type PaginatedPreferencesDto = PaginatedResponseDto<PreferenceDto>;

// Odpowiedź z listą przepisów i paginacją
export type PaginatedRecipesDto = PaginatedResponseDto<RecipeDto>;

/**
 * AI Integration DTO i Command Models
 */

// Podstawowy przepis bez ID i metadanych
export type RecipeBasicDto = Pick<RecipeDto, "title" | "content" | "additional_params">;

// Prosty przepis z ID i tytułem do referencji
export type RecipeReferenceDto = Pick<RecipeDto, "id" | "title" | "content">;

// Command do generacji przepisu
export interface GenerateRecipeCommand {
  additional_params: string | null;
  base_recipe?: string;
}

// Wygenerowany przepis
export interface GeneratedRecipeDto {
  recipe: RecipeBasicDto;
  ai_model: string;
  generate_response_time: number;
}

// Command do modyfikacji przepisu
export interface ModifyRecipeCommand {
  additional_params: string | null;
  base_recipe?: string;
}

// Zmodyfikowany przepis
export interface ModifiedRecipeDto {
  original_recipe: RecipeReferenceDto;
  modified_recipe: RecipeBasicDto;
  ai_model: string;
  generate_response_time: number;
}

// Command do zapisania wygenerowanego/zmodyfikowanego przepisu
export interface SaveRecipeCommand {
  recipe: RecipeBasicDto;
  is_new: boolean;
  replace_existing?: {
    recipe_id: number;
    replace: boolean;
  };
}

// Typy dla logów akcji AI
export type ActionTypeEnum = Database["public"]["Enums"]["action_type_enum"];

// Typ dla kategorii preferencji
export type PreferenceCategoryEnum = Database["public"]["Enums"]["preference_category_enum"];

/**
 * Typy dla API błędów i statystyk
 */

// Typ dla błędów API
export interface APIError {
  error: string;
  details?: string;
  statusCode?: number;
}

// Typ dla statystyk użytkownika
export interface UserStatsDto {
  totalRecipes: number;
  aiGeneratedRecipes: number;
  lastRecipeDate?: string;
}

// Rozszerzenie istniejących typów dla odpowiedzi API
export interface RecipeApiResponse {
  data?: RecipeDto;
  error?: APIError;
}

export interface RecipesListApiResponse {
  data?: PaginatedRecipesDto;
  error?: APIError;
}
