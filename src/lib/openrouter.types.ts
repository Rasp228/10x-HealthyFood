/**
 * Typy i interfejsy dla OpenRouter Service
 */
export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ProcessedMessage extends Message {
  name?: string;
}

export interface ModelParameters {
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
}

/**
 * Struktura danych zawierająca informacje o modelu
 */
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxCompletionTokens?: number;
}

/**
 * Struktura modelu z API
 */
export interface ApiModelData {
  id: string;
  name: string;
  description: string;
  context_length?: number;
  max_completion_tokens?: number;
  vision?: boolean;
  json_mode?: boolean;
  function_calling?: boolean;
  streaming?: boolean;
  [key: string]: unknown;
}

export interface OpenRouterConfig {
  apiKey: string;
  apiUrl?: string;
  timeout?: number;
  retries?: number;
  defaultModel?: string;
  defaultParameters?: ModelParameters;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ChatPayload {
  model: string;
  messages: ProcessedMessage[];
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  max_tokens?: number;
  response_format?: {
    type: string;
    schema: JSONSchema;
  };
}

export interface ChatResponse {
  id: string;
  model: string;
  created: number;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Hierarchia klas błędów
 */
export class OpenRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export class AuthenticationError extends OpenRouterError {
  constructor(message = "Błąd uwierzytelniania API") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends OpenRouterError {
  constructor(message = "Przekroczono limit zapytań API") {
    super(message);
    this.name = "RateLimitError";
  }
}

export class ModelUnavailableError extends OpenRouterError {
  constructor(model: string, message?: string) {
    super(message || `Model ${model} jest niedostępny`);
    this.name = "ModelUnavailableError";
  }
}

export class TokenLimitError extends OpenRouterError {
  constructor(message = "Przekroczono limit tokenów dla tego kontekstu") {
    super(message);
    this.name = "TokenLimitError";
  }
}

export class ContentFilterError extends OpenRouterError {
  constructor(message = "Treść została zablokowana przez filtry zawartości") {
    super(message);
    this.name = "ContentFilterError";
  }
}

export class NetworkError extends OpenRouterError {
  constructor(message = "Błąd sieci podczas komunikacji z API") {
    super(message);
    this.name = "NetworkError";
  }
}

export class ResponseParsingError extends OpenRouterError {
  constructor(message = "Błąd podczas przetwarzania odpowiedzi API") {
    super(message);
    this.name = "ResponseParsingError";
  }
}

export class BudgetExceededError extends OpenRouterError {
  constructor(message = "Przekroczono budżet API") {
    super(message);
    this.name = "BudgetExceededError";
  }
}

// Eksportujemy własne typy dla axios
export interface AxiosResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: AxiosRequestConfig;
}

export interface AxiosRequestConfig {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  data?: unknown;
  timeout?: number;
  [key: string]: unknown;
}

export interface AxiosInstance {
  post: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  create: (config: AxiosRequestConfig) => AxiosInstance;
  interceptors: {
    response: {
      use: (onFulfilled: (value: AxiosResponse) => unknown, onRejected: (error: unknown) => unknown) => number;
    };
  };
}
