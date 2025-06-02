import type { Database, Tables } from "./db/database.types";

/**
 * Podstawowe DTO odpowiadające encjom bazy danych
 */

// Typ preferencji z bazy danych
export type PreferenceDto = Tables<"preferences">;

// Typ przepisu z bazy danych
export type RecipeDto = Tables<"recipes">;

// Typ logu z bazy danych
export type LogDto = Tables<"logs">;

/**
 * Parametry sortowania
 */

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
 * DTO
 */

// Interfejs generyczny dla odpowiedzi
export interface ResponseDto<T> {
  data: T[];
  total: number;
}

// Odpowiedź z listą preferencji
export type PreferencesDto = ResponseDto<PreferenceDto>;

// Odpowiedź z listą przepisów
export type RecipesDto = ResponseDto<RecipeDto>;

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
  data?: RecipesDto;
  error?: APIError;
}

/**
 * Typy dla modala szczegółów przepisu
 */

// Props dla komponentu modala szczegółów przepisu
export interface RecipeViewModalProps {
  isOpen: boolean;
  recipeId: number | null;
  onClose: () => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
  onSuccess?: () => void;
}

// Props dla refaktoryzowanego komponentu zawartości szczegółów
export interface RecipeDetailContentProps {
  recipe: RecipeDto | null;
  isLoading?: boolean;
  error?: Error | null;
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean; // dla rozróżnienia strony vs modala
  className?: string; // dla customizacji stylów
}

// Rozszerzenie props dla RecipeCard o nowy callback
export interface RecipeCardViewProps {
  recipe: RecipeDto;
  onView?: (id: number) => void; // Nowy callback
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
}

// Hook dla modala
export interface UseRecipeModalResult {
  isOpen: boolean;
  recipeId: number | null;
  recipe: RecipeDto | null;
  isLoading: boolean;
  error: Error | null;
  openModal: (id: number) => void;
  closeModal: () => void;
  refetch: () => void;
}

// Cache management dla optymalizacji
export type RecipeCache = Record<
  number,
  {
    recipe: RecipeDto;
    timestamp: number;
  }
>;

export interface ModalState {
  isOpen: boolean;
  recipeId: number | null;
  cache: RecipeCache;
}
