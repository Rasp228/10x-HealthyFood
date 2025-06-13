import type {
  ActionTypeEnum,
  GenerateRecipeCommand,
  GeneratedRecipeDto,
  ModifyRecipeCommand,
  ModifiedRecipeDto,
  PreferenceDto,
} from "../../types";
import { OpenRouterService } from "../api/openrouter.service";
import type { JSONSchema, ChatResponse } from "../api/openrouter.types";
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

      // Pobierz i przetworz preferencje użytkownika
      const userPreferences = await this.getFormattedUserPreferences(userId);

      // Przygotuj treść przepisu bazowego, jeśli istnieje
      const baseRecipeText = command.base_recipe ? `Przepis bazowy do inspiracji:\n${command.base_recipe}` : "";

      // Przygotuj dodatkowe parametry, jeśli istnieją
      const additionalParamsText = command.additional_params
        ? `Dodatkowe instrukcje: ${command.additional_params}`
        : "";

      // Połącz wszystkie informacje dla użytkownika w jedną wiadomość
      const userMessage = [
        additionalParamsText,
        baseRecipeText,
        userPreferences ? `Moje preferencje żywieniowe:\n${userPreferences}` : "",
        !command.base_recipe && !command.additional_params ? "Wygeneruj losowy przepis" : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      // Wiadomość systemowa z preferencjami użytkownika i instrukcjami
      const systemMessage = `
        Twoim nieugiętym celem jest dostarczanie precyzyjnych, konkretnych przepisów kulinarnych, 
        zoptymalizowanych pod indywidualne preferencje żywieniowe użytkownika. Działasz zgodnie z poniższymi wytycznymi:
        
        1. **Wejście**  
          - \`base_recipe\` (string | null): przepis bazowy do inspiracji/modyfikacji, albo \`null\`, gdy brak przepisu bazowego.  
          - \`user_preferences\` (string | null): sformatowane preferencje żywieniowe użytkownika (lubiane, nielubiane, wykluczone, diety), albo \`null\`. 
          - \`additional_params\` (string | null): opcjonalne dodatkowe instrukcje od użytkownika (np. "mniej soli", "wegańskie zamienniki"), albo \`null\`.  

        2. **Zasady działania** 
          a) **Jeżeli podano \`base_recipe\`** (użytkownik wkleił przepis do inspiracji):  
            - ZAWSZE traktuj to jako modyfikację/ulepszenie podanego przepisu bazowego
            - Dostosuj składniki, kroki przygotowania zgodnie z \`user_preferences\` i \`additional_params\`
            - Zachowaj podstawową strukturę i charakter oryginalnego przepisu
            - Uwzględnij wszystkie preferencje użytkownika mające zastosowanie w przypadku danego przepisu i dodatkowe instrukcje
            - NIE generuj zupełnie nowego losowego przepisu
            - Maksymalna długość: 5000 znaków

          b) **Jeżeli NIE podano \`base_recipe\`** (brak przepisu bazowego):  
            i) Jeżeli \`user_preferences\` niepuste:  
              - Wygeneruj kompletny, nowy przepis uwzględniający wszystkie preferencje, ale pamiętaj że ich użycie powinno być sensowne w kontekście przepisu
            ii) Jeżeli \`user_preferences\` puste:  
              - Wygeneruj w pełni losowy, ale kulinarnie sensowny przepis  
            - Przepis nie może przekroczyć 5000 znaków

        3. **Struktura odpowiedzi**  
          Zawsze zwracaj wyłącznie obiekt JSON w formacie:  
          \`\`\`json
          {
            "title": "Tytuł przepisu kulinarnego adekwatny do treści przepisu",
            "content": "Pełna treść przepisu zawierająca listę składników, kroki przygotowania, wartości odżywcze",
            "additional_params": "Opcjonalnie dodatkowe parametry zawierające informacje o przepisie, należy je oddzielać przecinkiem"
          }
          \`\`\`

        4. **Ograniczenia i priorytety**  
          - Maksymalna długość \`title\`: 100 znaków   
          - Maksymalna długość \`content\`: 5000 znaków   
          - Maksymalna długość \`additional_params\`: 4000 znaków   
          - Stawiaj na jasność i zwięzłość: brak zbędnych opisów, pełna konkretność
          - NIGDY nie pokazuj procesu myślenia - zwracaj tylko końcowy przepis w formacie JSON
          - Jeśli modyfikujesz przepis bazowy, zachowaj jego główne cechy ale dostosuj do preferencji
      `;

      // Wywołaj API OpenRouter
      const response = await this.openRouterService.sendMessage(userMessage, systemMessage);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const aiModel = response.model || "unknown";

      // Parsowanie odpowiedzi
      const parsedRecipe = this.parseAIResponse(response);

      // Zapisz log akcji
      const logId = await this.logAIAction(userId, "generate_new", aiModel, responseTime);

      return {
        recipe: {
          title: parsedRecipe.title,
          content: parsedRecipe.content,
          additional_params: parsedRecipe.additional_params || command.additional_params,
        },
        ai_model: aiModel,
        generate_response_time: responseTime,
        logId,
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

      // Pobierz i przetworz preferencje użytkownika
      const userPreferences = await this.getFormattedUserPreferences(userId);

      // Pobierz i przetworz preferencje z oryginalnego przepisu (additional_params)
      const recipePreferences = await this.getRecipePreferences(recipeId, userId);

      // Połącz preferencje użytkownika z preferencjami z przepisu
      const combinedPreferences = this.combinePreferences(userPreferences, recipePreferences);

      // Przygotuj treść przepisu bazowego
      const baseRecipeText = command.base_recipe ? `Przepis do modyfikacji:\n${command.base_recipe}` : "";

      // Przygotuj dodatkowe parametry modyfikacji
      const additionalParamsText = command.additional_params
        ? `Instrukcje modyfikacji: ${command.additional_params}`
        : "";

      // Połącz wszystkie informacje dla użytkownika w jedną wiadomość
      const userMessage = [
        additionalParamsText,
        baseRecipeText,
        combinedPreferences ? `Moje preferencje żywieniowe:\n${combinedPreferences}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      // Wiadomość systemowa dla modyfikacji przepisu
      const systemMessage = `
        Twoim celem jest modyfikacja istniejącego przepisu kulinarnego zgodnie z instrukcjami użytkownika i jego preferencjami żywieniowymi.
        
        1. **Wejście**  
          - \`base_recipe\` (string): istniejący przepis do modyfikacji
          - \`user_preferences\` (string | null): sformatowane preferencje żywieniowe użytkownika (lubiane, nielubiane, wykluczone, diety), albo \`null\`.
          - \`additional_params\` (string | null): instrukcje modyfikacji od użytkownika, albo \`null\`.
          
        2. **Zasady modyfikacji**
          - Zachowaj podstawową strukturę i charakter oryginalnego przepisu
          - Dostosuj składniki zgodnie z preferencjami użytkownika, ale pamiętaj że ich użycie powinno być sensowne w kontekście przepisu
          - Uwzględnij wszystkie instrukcje modyfikacji z \`additional_params\`
          - Nie dodawaj składników sprzecznych z preferencjami użytkownika, ale pamiętaj że ich użycie powinno być sensowne w kontekście przepisu
          - Zachowaj proporcje i logikę kulinarną
          - Maksymalna długość treści: 5000 znaków
          
        3. **Struktura odpowiedzi**  
          Zawsze zwracaj wyłącznie obiekt JSON w formacie:  
          \`\`\`json
          {
            "title": "Zmodyfikowany tytuł przepisu (może zostać obecny)",
            "content": "Zmodyfikowana treść przepisu z listą składników, krokami przygotowania, wartościami odżywczymi",
            "additional_params": "Opcjonalnie dodatkowe parametry zawierające informacje o przepisie, należy je oddzielać przecinkiem. Mogą zostać obecne jeśli są konkretne i sensowne, jeśli nie można je uprościć i skonkretyzować"
          }
          \`\`\`
          
        4. **Ograniczenia**  
          - Maksymalna długość \`title\`: 100 znaków.   
          - Maksymalna długość \`content\`: 5000 znaków   
          - Maksymalna długość \`additional_params\`: 4000 znaków.   
          - Zachowaj czytelność i konkretność
          - Nie dodawaj zbędnych opisów
          - NIGDY nie pokazuj procesu myślenia - zwracaj tylko końcowy przepis w formacie JSON.
      `;

      // Wywołaj API OpenRouter
      const response = await this.openRouterService.sendMessage(userMessage, systemMessage);

      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const aiModel = response.model || "unknown";

      // Parsowanie odpowiedzi
      const parsedRecipe = this.parseAIResponse(response);

      // Zapisz log akcji
      const logId = await this.logAIAction(userId, "generate_modification", aiModel, responseTime);

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
        logId,
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

      // Najpierw spróbuj znaleźć JSON w odpowiedzi
      const jsonMatch = this.extractJsonFromResponse(rawContent);
      if (jsonMatch) {
        try {
          const jsonResponse = JSON.parse(jsonMatch);

          // Format z description polami - główny format używany przez AI
          if (jsonResponse.title?.description && jsonResponse.content?.description) {
            let additionalParams = null;

            // Obsługa różnych formatów additional_params
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

          // Prosty format JSON
          if (jsonResponse.title && jsonResponse.content) {
            return {
              title: this.sanitizeField(jsonResponse.title, 100) || "Wygenerowany przepis",
              content: this.sanitizeField(jsonResponse.content, 5000) || "Brak treści przepisu",
              additional_params: jsonResponse.additional_params
                ? this.sanitizeField(jsonResponse.additional_params, 5000)
                : null,
            };
          }
        } catch (parseError) {
          console.warn("Nie udało się sparsować znalezionego JSON:", parseError);
        }
      }

      // Fallback: parsowanie tekstowe z ukryciem reasoning
      return this.fallbackTextParsing(rawContent);
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
   * Ekstraktuje JSON z odpowiedzi AI, ukrywając process reasoning
   */
  private extractJsonFromResponse(content: string): string | null {
    // Usuń bloki kodu markdown z JSON
    const jsonBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonBlockMatch) {
      return jsonBlockMatch[1];
    }

    // Szukaj JSON w tekście - szukamy ostatniego wystąpienia (końcowy wynik)
    const jsonMatches = content.match(/\{[\s\S]*?\}/g);
    if (jsonMatches && jsonMatches.length > 0) {
      // Bierz ostatni JSON w odpowiedzi (najprawdopodobniej końcowy wynik)
      return jsonMatches[jsonMatches.length - 1];
    }

    return null;
  }

  /**
   * Fallback dla parsowania tekstowej odpowiedzi z ukryciem reasoning
   */
  private fallbackTextParsing(content: string): { title: string; content: string; additional_params?: string | null } {
    // Ukrywanie procesu reasoningowego - szukamy końcowego wyniku
    const lines = content.split("\n");

    // Rozszerzona lista słów kluczowych reasoning
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
      "więc",
      "zatem",
      "dlatego",
      "ponieważ",
      "bowiem",
      "gdyż",
      "żeby",
      "aby",
      "w związku z tym",
      "biorąc pod uwagę",
      "mając na uwadze",
      "uwzględniając",
    ];

    // Znajdź pierwszy wiersz który wygląda na tytuł przepisu (nie reasoning)
    let title = "";
    let contentStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Pomijamy puste linie
      if (!line) continue;

      // Pomijamy linie z reasoning
      if (reasoningKeywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase()))) {
        continue;
      }

      // Pomijamy linie zaczynające się od słów typu "Oto", "Poniżej", "Tutaj"
      if (/^(oto|poniżej|tutaj|przedstawiam|prezentuję)/i.test(line)) {
        continue;
      }

      // Jeśli znajdziemy pierwszy sensowny wiersz, traktujemy go jako tytuł
      if (!title && line.length > 0 && line.length <= 100) {
        title = line
          .replace(/^#+\s*/, "") // Usuń markdown headers
          .replace(/^\*+\s*/, "") // Usuń gwiazdki
          .replace(/^-+\s*/, "") // Usuń myślniki
          .replace(/^\d+\.\s*/, "") // Usuń numerację
          .trim();
        contentStartIndex = i + 1;
        break;
      }
    }

    // Jeśli nie znaleźliśmy tytułu, użyj pierwszej niepustej linii
    if (!title) {
      const firstNonEmptyLine = lines.find((line) => line.trim().length > 0);
      title = firstNonEmptyLine?.replace(/^#+\s*/, "").trim() || "Wygenerowany przepis";
      contentStartIndex = lines.findIndex((line) => line.trim() === firstNonEmptyLine?.trim()) + 1;
    }

    // Ekstraktuj treść przepisu, pomijając dalsze reasoning
    const contentLines = lines.slice(contentStartIndex);
    const cleanedContent = contentLines
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true; // Zachowaj puste linie dla formatowania

        // Filtruj linie z reasoning
        return !reasoningKeywords.some((keyword) => trimmed.toLowerCase().includes(keyword.toLowerCase()));
      })
      .join("\n")
      .trim();

    return {
      title: this.sanitizeField(title, 100) || "Wygenerowany przepis",
      content: this.sanitizeField(cleanedContent || content, 5000) || "Brak treści przepisu",
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
   * Pobiera i formatuje preferencje użytkownika dla AI
   * @param userId - ID użytkownika
   * @returns Sformatowane preferencje jako string
   */
  private async getFormattedUserPreferences(userId: string): Promise<string | null> {
    try {
      const userPreferencesArray = await this.getUserPreferences(userId);

      if (userPreferencesArray.length === 0) {
        return null;
      }

      // Grupuj preferencje według kategorii
      const grouped = userPreferencesArray.reduce<Record<string, string[]>>((acc, pref) => {
        if (!acc[pref.category]) {
          acc[pref.category] = [];
        }
        acc[pref.category].push(pref.value);
        return acc;
      }, {});

      // Formatuj preferencje w czytelny sposób
      const formatted = Object.entries(grouped)
        .map(([category, values]) => {
          const categoryLabel = this.getCategoryLabel(category);
          return `${categoryLabel}: ${values.join(", ")}`;
        })
        .join("\n");

      return formatted;
    } catch (error) {
      console.error("Błąd podczas formatowania preferencji:", error);
      return null;
    }
  }

  /**
   * Pobiera preferencje z przepisu (additional_params)
   * @param recipeId - ID przepisu
   * @param userId - ID użytkownika (dla bezpieczeństwa)
   * @returns Preferencje z przepisu lub null
   */
  private async getRecipePreferences(recipeId: number, userId: string): Promise<string | null> {
    try {
      const { data: recipe, error } = await this.supabase
        .from("recipes")
        .select("additional_params")
        .eq("id", recipeId)
        .eq("user_id", userId)
        .single();

      if (error || !recipe || !recipe.additional_params) {
        return null;
      }

      return recipe.additional_params;
    } catch (error) {
      console.error("Błąd podczas pobierania preferencji z przepisu:", error);
      return null;
    }
  }

  /**
   * Łączy preferencje użytkownika z preferencjami z przepisu
   * @param userPreferences - Preferencje z profilu użytkownika
   * @param recipePreferences - Preferencje z przepisu
   * @returns Połączone preferencje
   */
  private combinePreferences(userPreferences: string | null, recipePreferences: string | null): string | null {
    const parts = [userPreferences, recipePreferences].filter(Boolean);

    if (parts.length === 0) {
      return null;
    }

    if (parts.length === 1) {
      return parts[0];
    }

    return `${userPreferences}\n\nDodatkowe uwagi do przepisu:\n${recipePreferences}`;
  }

  /**
   * Mapuje kategorię preferencji na czytelną etykietę
   * @param category - Kategoria preferencji
   * @returns Czytelna etykieta
   */
  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      diety: "Diety",
      lubiane: "Produkty lubiane",
      nielubiane: "Produkty nielubiane",
      wykluczone: "Produkty wykluczone",
    };

    return labels[category] || category;
  }

  /**
   * Zapisuje log akcji AI
   * @param userId - ID użytkownika
   * @param actionType - Typ akcji
   * @param aiModel - Nazwa modelu AI
   * @param responseTime - Czas odpowiedzi w ms
   * @returns ID zapisanego logu lub null w przypadku błędu
   */
  private async logAIAction(
    userId: string,
    actionType: ActionTypeEnum,
    aiModel: string,
    responseTime: number
  ): Promise<number | null> {
    try {
      const { data, error } = await this.supabase
        .from("logs")
        .insert({
          user_id: userId,
          action_type: actionType,
          actual_ai_model: aiModel,
          generate_response_time: responseTime,
          is_accepted: false, // Domyślnie false - zmieniane na true tylko po zapisaniu
        })
        .select()
        .single();

      if (error) throw error;
      return data.id; // Zwróć ID logu do późniejszej aktualizacji
    } catch (error) {
      console.error("Błąd podczas zapisywania logu:", error);
      return null;
    }
  }

  /**
   * Aktualizuje log akcji AI po podjęciu decyzji przez użytkownika
   * @param logId - ID logu do aktualizacji
   * @param isAccepted - Czy propozycja została zaakceptowana
   */
  async updateAIActionLog(logId: number, isAccepted: boolean): Promise<void> {
    try {
      const { error } = await this.supabase.from("logs").update({ is_accepted: isAccepted }).eq("id", logId);

      if (error) {
        console.error("Błąd podczas aktualizacji logu:", error);
      }
    } catch (error) {
      console.error("Błąd podczas aktualizacji logu:", error);
    }
  }
}
