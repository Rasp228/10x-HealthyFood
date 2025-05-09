import type {
  ActionTypeEnum,
  GenerateRecipeCommand,
  GeneratedRecipeDto,
  PreferenceCategoryEnum, //TODO trzeba dodać rozdzielanie preferencji w zależności od typu
  PreferenceDto,
} from "../../types";
import { supabaseClient } from "../../db/supabase.client";
import { OpenRouterService } from "../openrouter.service";
import type { JSONSchema, ChatResponse } from "../openrouter.types";
//TODO autoryzacja do ogarnięcia!
/**
 * Serwis obsługujący interakcje z AI poprzez OpenRouter.ai
 */
export class AIService {
  private readonly openRouterService: OpenRouterService;

  constructor() {
    // Inicjalizacja OpenRouterService z domyślnym kluczem API z .env
    this.openRouterService = new OpenRouterService({
      apiKey: import.meta.env.OPENROUTER_API_KEY,
    });

    // Konfiguracja formatu odpowiedzi dla generowania przepisów
    const recipeSchema: JSONSchema = {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Tytuł przepisu kulinarnego",
        },
        content: {
          type: "string",
          description: "Pełna treść przepisu zawierająca składniki i sposób przygotowania",
        },
      },
      required: ["title", "content"],
    };

    this.openRouterService.setResponseFormat(recipeSchema);
  }

  /**
   * Generuje przepis kulinarny na podstawie preferencji użytkownika
   * @param userId - ID użytkownika
   * @param command - Parametry dla generacji przepisu
   * @returns Wygenerowany przepis lub null w przypadku błędu
   */
  async generateRecipe(
    userId: string,
    command: GenerateRecipeCommand,
    selectedModel?: string
  ): Promise<GeneratedRecipeDto | null> {
    try {
      const startTime = Date.now();

      // Ustaw model i opcjonalnie parametry według potrzeb
      if (selectedModel) {
        this.openRouterService.setModel(selectedModel);
      }

      // Pobierz preferencje użytkownika
      const userPreferencesArray = await this.getUserPreferences(userId);

      // Konwertuj preferencje na format tekstowy do użycia w wiadomości
      const userPreferencesText =
        userPreferencesArray.length > 0
          ? userPreferencesArray.map((pref) => `${pref.category}: ${pref.value}`).join("\n")
          : "Brak specyficznych preferencji";

      // Przygotuj treść przepisu bazowego, jeśli istnieje
      const baseRecipeText = command.base_recipe ? `Przepis bazowy do modyfikacji:\n${command.base_recipe}` : "";

      // Przygotuj dodatkowe parametry, jeśli istnieją
      const additionalParamsText = command.additional_params
        ? `Dodatkowe instrukcje: ${command.additional_params}`
        : "";

      // Połącz wszystkie informacje dla użytkownika w jedną wiadomość
      const userMessage = [
        additionalParamsText,
        baseRecipeText,
        `Preferencje użytkownika:\n${userPreferencesText}`,
        !command.base_recipe && !command.additional_params ? "Wygeneruj losowy przepis" : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      // Wiadomość systemowa z preferencjami użytkownika i instrukcjami
      const systemMessage = `
        Twoim nieugiętym celem jest dostarczanie precyzyjnych, konkretnych przepisów kulinarnych, 
        zoptymalizowanych pod indywidualne preferencje żywieniowe użytkownika. Działasz zgodnie z poniższymi wytycznymi:
        1. **Wejście**  
          - \`base_recipe\` (string | null): istniejący przepis do modyfikacji, albo \`null\`, gdy nie ma przepisu bazowego.  
          - \`user_preferences\` (array[string]): lista preferencji żywieniowych (lubiane, nielubiane, wykluczone, diety). Może być pusta.  
          - \`additional_params\` (string | null): opcjonalne dodatkowe instrukcje od użytkownika (np. "mniej soli", "wegańskie zamienniki"), albo \`null\`.  

        2. **Zasady generowania / edycji** 
          a) Jeżeli \`base_recipe\` ≠ \`null\`:  
            - Modyfikuj przepis, dostosowując składniki, kroki przygotowania i wartości odżywcze do \`user_preferences\` i \`additional_params\`.  
            - Nie dodawaj nowych kroków ani składników sprzecznych z preferencjami.  
            - Zachowaj strukturę i styl oryginału, nie przekraczaj 5000 znaków.  

          b) Jeżeli \`base_recipe\` = \`null\`:  
            i) Jeżeli \`user_preferences\` niepuste:  
              - Wygeneruj kompletny, nowy przepis uwzględniający wszystkie podane preferencje.  
            ii) Jeżeli \`user_preferences\` puste:  
              - Wygeneruj w pełni losowy, ale kulinarnie sensowny przepis.  
            - Przepis nie może przekroczyć 5000 znaków.  

        3. **Struktura odpowiedzi**  
          Zawsze zwracaj wyłącznie obiekt JSON w formacie:  
          \`\`\`json
          {
            title: {
              description: "Tytuł przepisu kulinarnego adekwatny do treści przepisu",
            },
            content: {
              description: "Pełna treść przepisu zawierająca listę składników, kroki przygotowania, wartości odżywcze",
            },
          }
          \`\`\`

        5. **Ograniczenia i priorytety**  
          - Maksymalna długość \`recipe_content\`: 5000 znaków.   
          - Stawiaj na jasność i zwięzłość: brak zbędnych opisów, pełna konkretność.
      `;

      // Wywołaj API OpenRouter
      const response = await this.openRouterService.sendMessage(userMessage, systemMessage);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const aiModel = response.model || "unknown";

      // Parsowanie odpowiedzi
      const parsedRecipe = this.parseAIResponse(response);

      // Zapisz log akcji
      await this.logAIAction(userId, "generate_new", aiModel, responseTime);

      return {
        recipe: {
          title: parsedRecipe.title,
          content: parsedRecipe.content,
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
   * Parsuje odpowiedź z API OpenRouter
   */
  private parseAIResponse(response: ChatResponse): { title: string; content: string } {
    try {
      if (response?.choices?.[0]?.message?.content) {
        // Próba parsowania JSON z odpowiedzi
        try {
          const jsonResponse = JSON.parse(response.choices[0].message.content);
          return {
            title: jsonResponse.title || "Wygenerowany przepis",
            content: jsonResponse.content || "Brak treści przepisu",
          };
        } catch {
          // Jeśli nie udało się sparsować JSON, użyj tekstu jako treści
          const content = response.choices[0].message.content;
          // Próba wyodrębnienia tytułu z pierwszej linii
          const lines = content.split("\n");
          const title = lines[0].replace(/^#\s*/, "").trim();
          const remainingContent = lines.slice(1).join("\n").trim();

          return {
            title: title || "Wygenerowany przepis",
            content: remainingContent || content,
          };
        }
      }

      // Domyślna odpowiedź, jeśli nie udało się sparsować
      return {
        title: "Wygenerowany przepis",
        content: "Nie udało się wygenerować treści przepisu.",
      };
    } catch (error) {
      console.error("Błąd podczas parsowania odpowiedzi:", error);
      return {
        title: "Błąd generowania",
        content: "Wystąpił problem podczas przetwarzania odpowiedzi z AI.",
      };
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
