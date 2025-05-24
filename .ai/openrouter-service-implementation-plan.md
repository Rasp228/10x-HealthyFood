# Plan Implementacji Usługi OpenRouter

## 1. Opis Usługi

Usługa OpenRouter będzie odpowiedzialna za komunikację z API OpenRouter, umożliwiając integrację modeli językowych (LLM) z aplikacją. Głównym celem usługi jest zarządzanie kontekstem konwersacji oraz przetwarzanie strukturyzowanych odpowiedzi.

## 2. Opis Konstruktora

Konstruktor usługi powinien:

- Inicjować konfigurację API (API key, baza URL, itp.).
- Ustawić domyslne parametry modelu (temperature, top_p, frequency_penalty, presence_penalty).
- Umożliwiać konfigurację komunikatu systemowego (role: 'system') oraz użytkownika (role: 'user').
- Akceptować opcjonalne parametry inicjalizacyjne (np. timeout, retries).

## 3. Publiczne Metody i Pola

- **sendChatMessage(userMessage: string): Promise<ResponseType>**

  - Wysyła komunikat użytkownika do API, uwzględniając wcześniej ustawiony komunikat systemowy oraz konfigurację modelu.

- **setSystemMessage(message: string): void**

  - Umożliwia ustawienie komunikatu systemowego.

- **setUserMessage(message: string): void**

  - Umożliwia ustawienie komunikatu użytkownika.

- **setResponseFormat(schema: JSONSchema): void**

  - Konfiguruje schemat JSON dla strukturalnych odpowiedzi (response_format).

- **setModel(name: string, parameters: ModelParameters): void**
  - Pozwala na wybór modelu (model: [model-name]) oraz ustawienie jego parametrów (temperature, top_p, frequency_penalty, presence_penalty).
  - Publiczne pola konfiguracyjne, takie jak apiUrl, apiKey oraz domyślne ustawienia modelu

## 4. Prywatne Metody i Pola

```typescript

// Manager limitów API
private rateLimiter: RateLimiter;

// System retryingu
private retryHandler: RetryHandler;
```

### 4.1. Metody Pomocnicze

```typescript
/**
 * Wykonuje właściwe żądanie do API OpenRouter
 */
private async executeRequest(endpoint: string, payload: any): Promise<any>;

/**
 * Przetwarza wiadomości przed wysłaniem do API
 */
private prepareMessages(messages: Message[]): ProcessedMessage[];

/**
 * Weryfikuje i formatuje odpowiedź z API
 */
private processResponse(response: any): ChatResponse;

/**
 * Zarządza limitami tokenów dla kontekstu
 */
private truncateContext(messages: Message[], model: string): Message[];

/**
 * Aktualizuje statystyki wykorzystania API
 */
private updateUsageStats(responseMetadata: any): void;
```

## 5. Obsługa Błędów

### 5.1. Typy Błędów

```typescript
// Hierarchia klas błędów
class OpenRouterError extends Error {}

class AuthenticationError extends OpenRouterError {}
class RateLimitError extends OpenRouterError {}
class ModelUnavailableError extends OpenRouterError {}
class TokenLimitError extends OpenRouterError {}
class ContentFilterError extends OpenRouterError {}
class NetworkError extends OpenRouterError {}
class ResponseParsingError extends OpenRouterError {}
class BudgetExceededError extends OpenRouterError {}
```

### 5.2. Strategie Obsługi Błędów

1. **Retry z exponential backoff** dla błędów sieciowych i chwilowych problemów API
2. **Degradacja jakości** przy problemach z wybranymi modelami (przejście na mniej zaawansowane)
3. **Przejrzyste komunikaty błędów** dla użytkowników

## 6. Kwestie Bezpieczeństwa

1. **Ochrona danych użytkowników**:

   - Sanityzacja danych wejściowych
   - Filtrowanie danych wrażliwych przed wysłaniem do API

2. **Walidacja odpowiedzi**:

   - Sprawdzanie zgodności ze schematami
   - Filtrowanie potencjalnie szkodliwych treści

3. **Audyt i logowanie**:
   - Rejestrowanie wykorzystania API z zachowaniem prywatności
   - System alertów dla nietypowych wzorców użycia

## 7. Plan Wdrożenia Krok po Kroku

### Etap 1: Konfiguracja Projektu

1. Utworzenie struktury katalogów zgodnie z wytycznymi projektu:

   ```
   src/
   ├── lib/
   │   ├── openrouter/
   │   │   ├── index.ts              # Eksport głównej usługi
   │   │   ├── openrouter-service.ts # Główna implementacja
   │   │   ├── types.ts              # Typy i interfejsy
   │   │   ├── error-handling.ts     # System obsługi błędów
   │   │   ├── response-formats.ts   # Predefiniowane formaty odpowiedzi
   │   │   ├── models-manager.ts     # Zarządzanie modelami
   │   │   └── utils.ts              # Funkcje pomocnicze
   │   └── ...
   └── ...
   ```

2. Zainstalowanie niezbędnych zależności:
   ```bash
   npm install axios zod @supabase/supabase-js
   ```

### Etap 2: Implementacja Podstawowej Funkcjonalności

1. Implementacja klienta HTTP (`src/lib/openrouter/http-client.ts`):

   - Konfiguracja Axios z interceptorami
   - Obsługa nagłówków autoryzacyjnych
   - Podstawowa obsługa błędów HTTP

2. Implementacja głównej usługi (`src/lib/openrouter/openrouter-service.ts`):

   - Konstruktor z konfiguracją
   - Podstawowe metody chat
   - Inicjalizacja managera modeli

3. Implementacja typów (`src/lib/openrouter/types.ts`):
   - Definicje interfejsów wiadomości
   - Typy parametrów modeli
   - Interfejsy formatu odpowiedzi

### Etap 3: Implementacja Zaawansowanych Funkcji

1. System obsługi błędów (`src/lib/openrouter/error-handling.ts`):

   - Implementacja hierarchii klas błędów
   - System retryingu z wykładniczym opóźnieniem
   - Integracja z systemem logowania aplikacji

2. Manager modeli (`src/lib/openrouter/models-manager.ts`):

   - Pobieranie i cache'owanie dostępnych modeli
   - Logika wyboru optymalnych modeli
   - Zarządzanie parametrami modeli

3. Predefiniowane formaty odpowiedzi (`src/lib/openrouter/response-formats.ts`):
   - Biblioteka gotowych schematów JSON
   - Funkcje pomocnicze do tworzenia i walidacji schematów
   - Przykładowe schematy dla typowych przypadków użycia

### Etap 4: Integracja z Aplikacją

1. Implementacja hooka React (`src/components/openrouter-context.tsx`):

   - Provider kontekstu OpenRouter
   - Hook useOpenRouter do wykorzystania w komponentach

2. Implementacja w Supabase (`src/lib/openrouter/supabase-cache.ts`):
   - Statystyki wykorzystania API

### Podsumowanie implementacji

Powyższy plan przedstawia kompleksowe podejście do implementacji usługi OpenRouter, która będzie obsługiwać komunikację z API OpenRouter i integrować się z aplikacją w stacku Astro/React/TypeScript.

Kluczowe aspekty implementacji obejmują:

- Zarządzanie kontekstem konwersacji
- Obsługę strukturyzowanych odpowiedzi poprzez JSON schematy
- Kompleksowy system obsługi błędów
