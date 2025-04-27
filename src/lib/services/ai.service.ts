import type {
  ActionTypeEnum,
  GenerateRecipeCommand,
  GeneratedRecipeDto,
  PreferenceCategoryEnum,
  PreferenceDto,
} from "../../types";
import { supabaseClient } from "../../db/supabase.client";

/**
 * Serwis obsługujący interakcje z AI poprzez OpenRouter.ai
 */
export class AIService {
  private readonly apiKey: string;
  private readonly openRouterUrl: string;

  constructor() {
    this.apiKey = import.meta.env.OPENROUTER_API_KEY;
    this.openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
  }

  /**
   * Generuje przepis kulinarny na podstawie preferencji użytkownika
   * @param userId - ID użytkownika
   * @param command - Parametry dla generacji przepisu
   * @returns Wygenerowany przepis lub null w przypadku błędu
   */
  async generateRecipe(userId: string, command: GenerateRecipeCommand): Promise<GeneratedRecipeDto | null> {
    try {
      // Preferencje będą wykorzystane w przyszłości przy integracji z AI
      // const userPreferences = await this.getUserPreferences(userId);
      // const preferencesByCategory = this.groupPreferencesByCategory(userPreferences);

      // Tymczasowa implementacja - zastąp faktycznym wywołaniem AI w przyszłości
      const startTime = Date.now();
      // Symulacja opóźnienia API
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const endTime = Date.now();
      const aiModel = "gpt-3.5-turbo";
      const responseTime = endTime - startTime;

      // Zapisz log akcji
      await this.logAIAction(userId, "generate_new", aiModel, responseTime);

      // Tymczasowa odpowiedź
      return {
        recipe: {
          title: "Przykładowy wygenerowany przepis",
          content: "Treść wygenerowanego przepisu...",
          additional_params: command.additional_params,
        },
        ai_model: aiModel,
        generate_response_time: responseTime,
      };
    } catch (error) {
      console.error("Błąd podczas generowania przepisu:", error);
      return null;
    }
  }

  /**
   * Pobiera preferencje użytkownika z bazy danych
   * @param userId - ID użytkownika
   * @returns Lista preferencji użytkownika
   */
  private async getUserPreferences(userId: string): Promise<PreferenceDto[]> {
    const { data, error } = await supabaseClient.from("preferences").select("*").eq("user_id", userId);

    if (error) {
      throw new Error(`Błąd podczas pobierania preferencji: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Grupuje preferencje użytkownika według kategorii
   * @param preferences - Lista preferencji użytkownika
   * @returns Obiekt z preferencjami pogrupowanymi według kategorii
   */
  private groupPreferencesByCategory(preferences: PreferenceDto[]): Record<PreferenceCategoryEnum, string[]> {
    return preferences.reduce(
      (acc, pref) => {
        if (!acc[pref.category]) {
          acc[pref.category] = [];
        }
        acc[pref.category].push(pref.value);
        return acc;
      },
      {} as Record<PreferenceCategoryEnum, string[]>
    );
  }

  /**
   * Zapisuje log akcji AI
   * @param userId - ID użytkownika
   * @param actionType - Typ akcji
   * @param aiModel - Nazwa modelu AI
   * @param responseTime - Czas odpowiedzi w ms
   */
  private async logAIAction(
    userId: string,
    actionType: ActionTypeEnum,
    aiModel: string,
    responseTime: number
  ): Promise<void> {
    try {
      await supabaseClient.from("logs").insert({
        user_id: userId,
        action_type: actionType,
        actual_ai_model: aiModel,
        generate_response_time: responseTime,
      });
    } catch (error) {
      console.error("Błąd podczas zapisywania logu:", error);
    }
  }
}
