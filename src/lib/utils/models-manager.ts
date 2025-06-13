import axios, { type AxiosInstance } from "axios";
import { OpenRouterError, NetworkError, AuthenticationError } from "../api/openrouter.types";
import type { ModelInfo, ApiModelData, ModelParameters } from "../api/openrouter.types";

/**
 * Manager modeli
 */
export class ModelsManager {
  private apiKey: string;
  private apiUrl: string;
  private httpClient: AxiosInstance;
  private models: ModelInfo[] = [];
  private lastFetchTime = 0;
  private cacheDuration = 24 * 60 * 60 * 1000; // 24 godziny w milisekundach
  private selectedModel: ModelInfo | null = null;

  /**
   * Tworzy nową instancję ModelsManager
   */
  constructor(apiKey: string, apiUrl = "https://openrouter.ai/api/v1") {
    if (!apiKey) {
      throw new Error("Klucz API jest wymagany");
    }

    this.apiKey = apiKey;
    this.apiUrl = apiUrl;

    // Inicjalizacja klienta HTTP
    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://api.example.com",
      },
    });
  }

  /**
   * Pobiera listę dostępnych modeli z API OpenRouter lub z pamięci podręcznej
   */
  public async getAvailableModels(): Promise<ModelInfo[]> {
    const now = Date.now();

    // Jeśli modele są już w pamięci podręcznej i nie są przestarzałe, zwróć je
    if (this.models.length > 0 && now - this.lastFetchTime < this.cacheDuration) {
      return this.models;
    }

    try {
      const response = await this.httpClient.get("/models");

      // Przetwarzanie odpowiedzi
      const modelData = response.data.data as ApiModelData[];
      this.models = this.processModelData(modelData);
      this.lastFetchTime = now;

      return this.models;
    } catch (error) {
      if (error instanceof Error) {
        if (axios.isAxiosError(error)) {
          const axiosError = error as { response?: { status: number } };
          if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
            throw new AuthenticationError("Nie można pobrać listy modeli: błąd uwierzytelniania");
          }
        }
        throw new NetworkError(`Nie można pobrać listy modeli: ${error.message}`);
      }
      throw new OpenRouterError("Nieznany błąd podczas pobierania listy modeli");
    }
  }

  /**
   * Wybiera model do użycia
   */
  public selectModel(modelId: string): ModelInfo | null {
    const model = this.models.find((m) => m.id === modelId);
    if (model) {
      this.selectedModel = model;
      return model;
    }
    return null;
  }

  /**
   * Zwraca aktualnie wybrany model
   */
  public getSelectedModel(): ModelInfo | null {
    return this.selectedModel;
  }

  /**
   * Przetwarza dane modeli z API OpenRouter
   */
  private processModelData(modelData: ApiModelData[]): ModelInfo[] {
    return modelData.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      contextWindow: model.context_length || 4096,
      maxCompletionTokens: model.max_completion_tokens,
    }));
  }

  /**
   * Generuje domyślne parametry dla danego modelu
   */
  public getDefaultParameters(modelId?: string): ModelParameters {
    const model = modelId ? this.models.find((m) => m.id === modelId) : this.selectedModel;

    if (!model) {
      return {
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 2048,
      };
    }

    const parameters: ModelParameters = {
      temperature: 0.7,
      top_p: 1,
      max_tokens: Math.min(model.maxCompletionTokens || 2048, 2048),
    };

    return parameters;
  }
}
