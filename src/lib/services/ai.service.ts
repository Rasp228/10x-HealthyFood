import type {
  ActionTypeEnum,
  GenerateRecipeCommand,
  GeneratedRecipeDto,
  ModifyRecipeCommand,
  ModifiedRecipeDto,
  PreferenceDto,
} from "../../types";
import { OpenRouterService } from "../openrouter.service";
import type { JSONSchema, ChatResponse } from "../openrouter.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../db/database.types";

/**
 * Serwis obsługujący interakcje z AI poprzez OpenRouter.ai
 */
export class AIService {
  private readonly openRouterService: OpenRouterService;
  private readonly supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    // Przechowaj instancję Supabase
    this.supabase = supabase;

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
            - Nie dodawaj całkowicie nowych kroków ani składników sprzecznych z preferencjami.  
            - Zachowaj strukturę i styl oryginału, nie przekraczaj 5000 znaków.  

          b) Jeżeli \`base_recipe\` = \`null\`:  
            i) Jeżeli \`user_preferences\` niepuste:  
              - Wygeneruj kompletny, nowy przepis uwzględniający wszystkie podane preferencje i nie przekraczający 5000 znaków.  
            ii) Jeżeli \`user_preferences\` puste:  
              - Wygeneruj w pełni losowy, ale kulinarnie sensowny przepis.  
            - Przepis nie może przekroczyć 5000 znaków.
            - user_preferences nie mogą przekroczyć 4000 znaków. 

        3. **Struktura odpowiedzi**  
          Zawsze zwracaj wyłącznie obiekt JSON w formacie:  
          \`\`\`json
          {
            title: {
              description: "Tytuł przepisu kulinarnego adekwatny do treści przepisu", (MAX 100 znaków)
            },
            content: {
              description: "Pełna treść przepisu zawierająca listę składników, kroki przygotowania, wartości odżywcze", (MAX 5000 znaków)
            },
            additional_params: {
              additional_params: "Opcjonalnie dodatkowe parametry zawierające informacje o przepisie, należy jed oddzielać przecinkiem" (MAX 4000 znaków)
            }
          }
          \`\`\`

        5. **Ograniczenia i priorytety**  
          - Maksymalna długość \`title\`: 100 znaków.   
          - Maksymalna długość \`content\`: 5000 znaków.   
          - Maksymalna długość \`additional_params\`: 4000 znaków.   
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
          additional_params: parsedRecipe.additional_params || command.additional_params,
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
   * Modyfikuje istniejący przepis kulinarny na podstawie preferencji użytkownika
   * @param userId - ID użytkownika
   * @param recipeId - ID przepisu do modyfikacji
   * @param command - Parametry dla modyfikacji przepisu
   * @returns Zmodyfikowany przepis lub null w przypadku błędu
   */
  async modifyRecipe(
    userId: string,
    recipeId: number,
    command: ModifyRecipeCommand,
    selectedModel?: string
  ): Promise<ModifiedRecipeDto | null> {
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

      // Przygotuj treść przepisu bazowego
      const baseRecipeText = command.base_recipe ? `Przepis do modyfikacji:\n${command.base_recipe}` : "";

      // Przygotuj dodatkowe parametry modyfikacji
      const additionalParamsText = command.additional_params
        ? `Instrukcje modyfikacji: ${command.additional_params}`
        : "";

      // Połącz wszystkie informacje dla użytkownika w jedną wiadomość
      const userMessage = [additionalParamsText, baseRecipeText, `Preferencje użytkownika:\n${userPreferencesText}`]
        .filter(Boolean)
        .join("\n\n");

      // Wiadomość systemowa dla modyfikacji przepisu
      const systemMessage = `
        Twoim celem jest modyfikacja istniejącego przepisu kulinarnego zgodnie z instrukcjami użytkownika i jego preferencjami żywieniowymi.
        
        1. **Wejście**  
          - \`base_recipe\` (string): istniejący przepis do modyfikacji
          - \`user_preferences\` (array[string]): lista preferencji żywieniowych (lubiane, nielubiane, wykluczone, diety)
          - \`additional_params\` (string): instrukcje modyfikacji od użytkownika
          
        2. **Zasady modyfikacji**
          - Zachowaj podstawową strukturę i charakter oryginalnego przepisu
          - Dostosuj składniki zgodnie z preferencjami użytkownika
          - Uwzględnij wszystkie instrukcje modyfikacji z \`additional_params\`
          - Nie dodawaj składników sprzecznych z preferencjami użytkownika
          - Zachowaj proporcje i logikę kulinarną
          - Maksymalna długość treści: 5000 znaków
          
        3. **Struktura odpowiedzi**  
          Zawsze zwracaj wyłącznie obiekt JSON w formacie:  
          \`\`\`json
          {
            title: {
              description: "Zmodyfikowany tytuł przepisu (może zostać obecny)", (MAX 100 znaków)
            },
            content: {
              description: "Zmodyfikowana treść przepisu z listą składników, krokami przygotowania, wartościami odżywczymi", (MAX 5000 znaków)
            },
            additional_params: {
              additional_params: "Opcjonalnie dodatkowe parametry zawierające informacje o przepisie, 
                należy jed oddzielać przecinkiem. Mogą zostać obecne jeśli są konkretne i sensowne, 
                jeśli nie można je uprościć i skonkretyzować" (MAX 4000 znaków)
            }
          }
          \`\`\`
          
        4. **Ograniczenia**  
          - Maksymalna długość \`title\`: 100 znaków.   
          - Maksymalna długość \`content\`: 5000 znaków.   
          - Maksymalna długość \`additional_params\`: 4000 znaków.   
          - Zachowaj czytelność i konkretność
          - Nie dodawaj zbędnych opisów
      `;

      // Wywołaj API OpenRouter
      const response = await this.openRouterService.sendMessage(userMessage, systemMessage);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const aiModel = response.model || "unknown";

      // Parsowanie odpowiedzi
      const parsedRecipe = this.parseAIResponse(response);

      // Zapisz log akcji
      await this.logAIAction(userId, "generate_modification", aiModel, responseTime);

      // Parsuj oryginalny przepis z base_recipe
      let originalRecipe;
      try {
        originalRecipe = JSON.parse(command.base_recipe || "{}");
      } catch {
        // Jeśli nie udało się sparsować, utwórz podstawowy obiekt
        originalRecipe = {
          id: recipeId,
          title: "Oryginalny przepis",
          content: command.base_recipe || "",
        };
      }

      return {
        original_recipe: {
          id: originalRecipe.id || recipeId,
          title: originalRecipe.title || "Oryginalny przepis",
          content: originalRecipe.content || command.base_recipe || "",
        },
        modified_recipe: {
          title: parsedRecipe.title,
          content: parsedRecipe.content,
          additional_params: parsedRecipe.additional_params || command.additional_params,
        },
        ai_model: aiModel,
        generate_response_time: responseTime,
      };
    } catch (error) {
      console.error("Błąd podczas modyfikacji przepisu:", error);
      return null;
    }
  }

  /**
   * Parsuje odpowiedź z API OpenRouter i ukrywa proces reasoningowy
   */
  private parseAIResponse(response: ChatResponse): {
    title: string;
    content: string;
    additional_params?: string | null;
  } {
    try {
      if (!response?.choices?.[0]?.message?.content) {
        return {
          title: "Błąd generowania",
          content: "Nie udało się otrzymać odpowiedzi z AI.",
          additional_params: null,
        };
      }

      const rawContent = response.choices[0].message.content;

      // Próba parsowania JSON z odpowiedzi
      try {
        const jsonResponse = JSON.parse(rawContent);

        // Obsługa różnych formatów JSON odpowiedzi
        if (jsonResponse.title && jsonResponse.content) {
          return {
            title: this.sanitizeField(jsonResponse.title, 100) || "Wygenerowany przepis",
            content: this.sanitizeField(jsonResponse.content, 5000) || "Brak treści przepisu",
            additional_params: jsonResponse.additional_params
              ? this.sanitizeField(jsonResponse.additional_params, 5000)
              : null,
          };
        }

        // Format z description polami - główny format używany przez AI
        if (jsonResponse.title?.description && jsonResponse.content?.description) {
          let additionalParams = null;

          // Obsługa additional_params.additional_params (format z przykładu)
          if (jsonResponse.additional_params?.additional_params) {
            additionalParams = this.sanitizeField(jsonResponse.additional_params.additional_params, 5000);
          } else if (jsonResponse.additional_params?.description) {
            additionalParams = this.sanitizeField(jsonResponse.additional_params.description, 5000);
          } else if (typeof jsonResponse.additional_params === "string") {
            additionalParams = this.sanitizeField(jsonResponse.additional_params, 5000);
          }

          return {
            title: this.sanitizeField(jsonResponse.title.description, 100) || "Wygenerowany przepis",
            content: this.sanitizeField(jsonResponse.content.description, 5000) || "Brak treści przepisu",
            additional_params: additionalParams,
          };
        }

        // Jeśli jest to obiekt ale nie ma oczekiwanych pól, spróbuj jako tekst
        return this.fallbackTextParsing(rawContent);
      } catch {
        // Jeśli nie udało się sparsować JSON, użyj parsowania tekstowego
        return this.fallbackTextParsing(rawContent);
      }
    } catch (error) {
      console.error("Błąd podczas parsowania odpowiedzi AI:", error);
      return {
        title: "Błąd generowania",
        content: "Wystąpił problem podczas przetwarzania odpowiedzi z AI.",
        additional_params: null,
      };
    }
  }

  /**
   * Fallback dla parsowania tekstowej odpowiedzi
   */
  private fallbackTextParsing(content: string): { title: string; content: string; additional_params?: string | null } {
    // Ukrywanie procesu reasoningowego - szukamy końcowego wyniku
    const lines = content.split("\n");

    // Próba znalezienia struktury z tytułem
    let title = "";
    let remainingContent = content;

    // Szukamy pierwszej linii która nie zawiera znaków myślenia AI
    const reasoningKeywords = [
      "myślę",
      "rozważam",
      "zastanawiam",
      "analizuję",
      "thinking",
      "considering",
      "let me think",
      "I think",
      "I need to",
      "first",
      "po pierwsze",
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Pomijamy puste linie i linie z procesem myślenia
      if (!line || reasoningKeywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase()))) {
        continue;
      }

      // Jeśli znajdziemy pierwszy sensowny wiersz, traktujemy go jako tytuł
      if (!title && line.length > 0 && line.length <= 100) {
        title = line
          .replace(/^#\s*/, "")
          .replace(/^\*\s*/, "")
          .trim();
        remainingContent = lines
          .slice(i + 1)
          .join("\n")
          .trim();
        break;
      }
    }

    // Jeśli nie znaleźliśmy tytułu, użyj pierwszej linii
    if (!title) {
      title = lines[0]?.replace(/^#\s*/, "").trim() || "Wygenerowany przepis";
      remainingContent = lines.slice(1).join("\n").trim();
    }

    return {
      title: this.sanitizeField(title, 100) || "Wygenerowany przepis",
      content: this.sanitizeField(remainingContent || content, 5000) || "Brak treści przepisu",
      additional_params: null, // W fallback nie parsujemy additional_params
    };
  }

  /**
   * Sanityzuje i obcina pole do maksymalnej długości
   */
  private sanitizeField(value: string, maxLength: number): string {
    if (typeof value !== "string") {
      return "";
    }

    const cleaned = value.trim();
    return cleaned.length <= maxLength ? cleaned : cleaned.substring(0, maxLength - 3) + "...";
  }

  /**
   * Pobiera preferencje użytkownika z bazy danych
   * @param userId - ID użytkownika
   * @returns Lista preferencji użytkownika
   */
  private async getUserPreferences(userId: string): Promise<PreferenceDto[]> {
    const { data, error } = await this.supabase.from("preferences").select("*").eq("user_id", userId);

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
      await this.supabase.from("logs").insert({
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
