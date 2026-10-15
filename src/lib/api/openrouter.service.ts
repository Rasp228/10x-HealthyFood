// Import axios jako moduł ESM
import axios from "axios";
import type { AxiosInstance, AxiosResponse } from "axios";
import type {
  Message,
  ProcessedMessage,
  ModelParameters,
  OpenRouterConfig,
  JSONSchema,
  ChatResponse,
  ChatPayload,
} from "./openrouter.types";
import { OpenRouterError, ResponseParsingError } from "./openrouter.types";
import { isRetryable, mapAxiosError } from "./openrouter.errors";

/**
 * Usługa OpenRouter do komunikacji z API OpenRouter
 */
export class OpenRouterService {
  private apiKey: string;
  private apiUrl: string;
  private defaultModel: string;
  private defaultParameters: ModelParameters;
  private timeout: number;
  private retries: number;
  private httpClient: AxiosInstance;
  private responseFormat: JSONSchema | null = null;

  /**
   * Tworzy nową instancję usługi OpenRouter
   */
  constructor(config: OpenRouterConfig) {
    // Użyj klucza API z konfiguracji lub z zmiennej środowiskowej
    this.apiKey = config.apiKey || import.meta.env.OPENROUTER_API_KEY;

    if (!this.apiKey) {
      throw new Error(
        "Klucz API jest wymagany - podaj go w konfiguracji lub ustaw zmienną OPENROUTER_API_KEY w pliku .env"
      );
    }

    this.apiUrl = config.apiUrl || "https://openrouter.ai/api/v1";
    // Tylko darmowy wariant (`:free`)
    this.defaultModel = config.defaultModel || "nvidia/nemotron-3-ultra-550b-a55b:free";
    this.defaultParameters = {
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 1024,
      ...config.defaultParameters,
    };
    this.timeout = config.timeout || 60000;
    this.retries = config.retries || 2;

    // Inicjalizacja klienta HTTP
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        // Atrybucja w OpenRouterze: produkcyjny adres aplikacji z Vercela. `process.env`, nie
        // `import.meta.env` - bez nowej zależności od zmiennych z czasu budowania.
        "HTTP-Referer": (typeof process !== "undefined" && process.env.SITE_URL) || "http://localhost",
        "X-Title": "HealthyMeal",
      },
    });

    // Bez interceptora błędów: mapuje wyłącznie `executeRequest` (`mapAxiosError`), raz. Interceptor
    // oddawał podklasę `OpenRouterError` bez `.response`, więc każde 4xx wyglądało na błąd sieci
    // i było ponawiane.
  }

  /**
   * Ustawia format odpowiedzi JSON
   * @param schema Schemat JSON do walidacji odpowiedzi
   * @throws {Error} Jeśli schemat jest nieprawidłowy
   */
  public setResponseFormat(schema: JSONSchema): void {
    // Podstawowa walidacja schematu
    if (!schema.type) {
      throw new Error("Schemat JSON musi zawierać pole 'type'");
    }

    if (schema.type !== "object") {
      throw new Error("Schemat JSON musi mieć typ 'object'");
    }

    if (!schema.properties || Object.keys(schema.properties).length === 0) {
      throw new Error("Schemat JSON musi zawierać przynajmniej jedno pole w 'properties'");
    }

    this.responseFormat = schema;
  }

  /**
   * Ustawia model i jego parametry
   */
  public setModel(name: string, parameters?: ModelParameters): void {
    this.defaultModel = name;
    if (parameters) {
      this.defaultParameters = { ...this.defaultParameters, ...parameters };
    }
  }

  /**
   * Wysyła wiadomość do API OpenRouter
   * @param systemMessage Wiadomość systemowa
   * @param userMessage Wiadomość użytkownika
   */
  public async sendMessage(userMessage: string, systemMessage: string): Promise<ChatResponse> {
    // Przygotowanie wiadomości
    const messages: Message[] = [];

    messages.push({ role: "system", content: systemMessage });
    messages.push({ role: "user", content: userMessage });

    // Przygotowanie payload'u
    const payload: ChatPayload = {
      model: this.defaultModel,
      messages: this.prepareMessages(messages),
      ...this.defaultParameters,
    };

    // Dodanie formatu odpowiedzi, jeśli jest ustawiony
    if (this.responseFormat) {
      payload.response_format = { type: "json_object", schema: this.responseFormat };
    }

    try {
      // Wykonanie żądania do API
      const response = await this.executeRequest("/chat/completions", payload);

      // Przetworzenie odpowiedzi
      return this.processResponse(response.data);
    } catch (error) {
      if (error instanceof OpenRouterError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new OpenRouterError(`Nieoczekiwany błąd: ${error.message}`, { cause: error, model: this.defaultModel });
      }
      throw new OpenRouterError("Wystąpił nieznany błąd", { cause: error, model: this.defaultModel });
    }
  }

  /**
   * Przetwarza wiadomości przed wysłaniem do API
   */
  private prepareMessages(messages: Message[]): ProcessedMessage[] {
    return messages.map((msg) => ({ ...msg }));
  }

  /**
   * Wykonuje właściwe żądanie do API OpenRouter.
   * Błąd mapujemy raz (`mapAxiosError`) i ten sam obiekt - ze `status`, `model` i `cause` -
   * dochodzi do trasy. Ponawiamy tylko błędy sieci i 5xx (`isRetryable`).
   */
  private async executeRequest(endpoint: string, payload: ChatPayload): Promise<AxiosResponse> {
    let attempt = 0;
    let lastError: OpenRouterError | null = null;

    while (attempt < this.retries) {
      try {
        return await this.httpClient.post(endpoint, payload);
      } catch (error) {
        lastError = mapAxiosError(error, this.defaultModel);

        // Dla błędów, których nie da się naprawić przez ponowienie próby
        if (!isRetryable(lastError)) {
          throw lastError;
        }

        attempt++;
        if (attempt < this.retries) {
          // Exponential backoff: wait 2^attempt * 100ms
          const delay = Math.pow(2, attempt) * 100;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // Jeśli wszystkie próby nie powiodły się
    if (lastError) {
      throw lastError;
    }

    throw new OpenRouterError("Maksymalna liczba prób została wyczerpana", { model: this.defaultModel });
  }

  /**
   * Weryfikuje i formatuje odpowiedź z API
   */
  private processResponse(response: unknown): ChatResponse {
    try {
      const typedResponse = response as ChatResponse;

      return typedResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new ResponseParsingError(`Błąd przetwarzania odpowiedzi: ${error.message}`);
      }
      throw new ResponseParsingError("Nieznany błąd podczas przetwarzania odpowiedzi");
    }
  }
}
