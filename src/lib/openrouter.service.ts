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
import {
  OpenRouterError,
  AuthenticationError,
  RateLimitError,
  ModelUnavailableError,
  TokenLimitError,
  ContentFilterError,
  NetworkError,
  ResponseParsingError,
  BudgetExceededError,
} from "./openrouter.types";

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
    this.defaultModel = config.defaultModel || "tngtech/deepseek-r1t-chimera:free";
    this.defaultParameters = {
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 1024,
      ...config.defaultParameters,
    };
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;

    // Inicjalizacja klienta HTTP
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://api.example.com",
        "X-Title": "OpenRouter Service Integration",
      },
    });

    // Dodanie interceptora dla obsługi błędów
    this.httpClient.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: unknown) => this.handleRequestError(error)
    );
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
        throw new OpenRouterError(`Nieoczekiwany błąd: ${error.message}`);
      }
      throw new OpenRouterError("Wystąpił nieznany błąd");
    }
  }

  /**
   * Przetwarza wiadomości przed wysłaniem do API
   */
  private prepareMessages(messages: Message[]): ProcessedMessage[] {
    return messages.map((msg) => ({ ...msg }));
  }

  /**
   * Wykonuje właściwe żądanie do API OpenRouter
   */
  private async executeRequest(endpoint: string, payload: ChatPayload): Promise<AxiosResponse> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < this.retries) {
      try {
        return await this.httpClient.post(endpoint, payload);
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;

          // Sprawdzenie, czy błąd kwalifikuje się do ponowienia próby
          if (this.isRetryableError(error)) {
            attempt++;
            // Exponential backoff: wait 2^attempt * 100ms
            const delay = Math.pow(2, attempt) * 100;
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // Dla błędów, których nie da się naprawić przez ponowienie próby
            throw this.mapErrorToCustomError(error);
          }
        } else {
          throw new OpenRouterError("Wystąpił nieznany błąd");
        }
      }
    }

    // Jeśli wszystkie próby nie powiodły się
    if (lastError) {
      throw this.mapErrorToCustomError(lastError);
    }

    throw new OpenRouterError("Maksymalna liczba prób została wyczerpana");
  }

  /**
   * Sprawdza, czy błąd kwalifikuje się do ponowienia próby
   */
  private isRetryableError(error: Error): boolean {
    // Błędy sieciowe i błędy serwera (5xx) mogą być ponawiane
    const axiosError = error as { response?: { status: number } };
    if (!axiosError.response) return true; // Brak odpowiedzi (np. timeout)
    return axiosError.response.status >= 500 && axiosError.response.status < 600;
  }

  /**
   * Mapuje błędy HTTP na dedykowane klasy błędów
   */
  private mapErrorToCustomError(error: Error): OpenRouterError {
    const axiosError = error as {
      response?: {
        status: number;
        data?: {
          error?: {
            message?: string;
          };
        };
      };
    };

    if (!axiosError.response) {
      return new NetworkError();
    }

    const { status, data } = axiosError.response;

    switch (status) {
      case 401:
      case 403:
        return new AuthenticationError(data?.error?.message || "Błąd uwierzytelniania");
      case 429:
        return new RateLimitError(data?.error?.message || "Przekroczono limit zapytań");
      case 404:
        return new ModelUnavailableError(this.defaultModel, data?.error?.message);
      case 400:
        if (data?.error?.message?.includes("token")) {
          return new TokenLimitError(data.error.message);
        }
        if (data?.error?.message?.includes("content")) {
          return new ContentFilterError(data.error.message);
        }
        return new OpenRouterError(data?.error?.message || "Błąd żądania");
      case 402:
        return new BudgetExceededError(data?.error?.message);
      default:
        return new OpenRouterError(data?.error?.message || `Błąd HTTP ${status}`);
    }
  }

  /**
   * Obsługuje błędy żądania
   */
  private handleRequestError(error: unknown): Promise<never> {
    if (error instanceof Error) {
      const customError = this.mapErrorToCustomError(error);
      return Promise.reject(customError);
    }
    return Promise.reject(new OpenRouterError("Wystąpił nieznany błąd"));
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
