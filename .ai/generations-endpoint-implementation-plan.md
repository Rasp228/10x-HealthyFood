# Plan wdrożenia endpointu API: POST /api/ai/generate-recipe

## 1. Przegląd punktu końcowego

Endpoint służy do generowania nowego przepisu kulinarnego przy użyciu AI na podstawie preferencji użytkownika. Wykorzystuje parametry dostarczone przez użytkownika, weryfikuje kompletność profilu (minimum 3 preferencje) i komunikuje się z modelem AI poprzez OpenRouter.ai.

## 2. Szczegóły żądania

- Metoda HTTP: POST
- Struktura URL: `/api/ai/generate-recipe`
- Nagłówki:
  - `Authorization: Bearer [token]` (wymagany)
  - `Content-Type: application/json` (wymagany)
- Request Body:
  ```json
  {
    "additional_params": "Parametry dla AI..."
  }
  ```

## 3. Wykorzystywane typy

- **DTOs**:
  - `GenerateRecipeCommand`: Typ dla danych wejściowych
  - `GeneratedRecipeDto`: Struktura odpowiedzi
  - `RecipeBasicDto`: Podstawowa struktura przepisu
  - `ActionTypeEnum`: Typ wyliczeniowy akcji AI
  - `PreferenceCategoryEnum`: Typy kategorii preferencji

## 4. Szczegóły odpowiedzi

- Status 200 OK:
  ```json
  {
    "recipe": {
      "title": "Wygenerowany Przepis",
      "content": "Treść wygenerowanego przepisu...",
      "additional_params": "Parametry dla AI..."
    },
    "ai_model": "nazwa_modelu",
    "generate_response_time": 1500
  }
  ```
- Status 400 Bad Request: Nieprawidłowe parametry lub niepełny profil
- Status 401 Unauthorized: Brak autoryzacji
- Status 500 Internal Server Error: Błąd wewnętrzny serwera

## 5. Przepływ danych

1. Walidacja danych wejściowych z użyciem Zod
2. Pobranie preferencji użytkownika z bazy danych
3. Sprawdzenie czy użytkownik ma minimum 3 preferencje
4. Pobranie preferencji (lubiane, nielubiane, wykluczone, diety)
5. Komunikacja z OpenRouter.ai w celu wygenerowania przepisu
6. Zapisanie logu akcji AI w tabeli `logs`
7. Zwrócenie wygenerowanego przepisu

## 6. Względy bezpieczeństwa

- Uwierzytelnianie poprzez JWT token z Supabase Auth
- RLS (Row Level Security) na poziomie bazy danych
- Walidacja danych wejściowych za pomocą Zod
- Limitowanie liczby zapytań do AI dla użytkownika
- Sanityzacja danych wejściowych przed wysłaniem do modelu AI
- Kontrola kosztów API dla modeli AI poprzez limity OpenRouter.ai

## 7. Obsługa błędów

- 400 Bad Request:
  - Nieprawidłowe parametry w `additional_params`
  - Użytkownik nie ma minimum 3 preferencji
  - Przekroczony limit zapytań w ciągu dnia
- 401 Unauthorized:
  - Brak tokenu JWT lub token wygasły
- 500 Internal Server Error:
  - Błąd komunikacji z OpenRouter.ai
  - Błąd wewnętrzny w przetwarzaniu odpowiedzi AI
  - Błąd zapisu logu

## 8. Rozważania dotyczące wydajności

- Obsługa długo trwających operacji AI w sposób asynchroniczny
- Monitorowanie czasu odpowiedzi modeli AI

## 9. Etapy wdrożenia

1. Utworzenie pliku endpointu `/src/pages/api/ai/generate-recipe.ts`
2. Implementacja schematu walidacji Zod dla `GenerateRecipeCommand`
3. Utworzenie/rozszerzenie serwisu `AIService` w `/src/lib/services/ai.service.ts`
4. Implementacja metody `generateRecipe` w serwisie
5. Implementacja połączenia z OpenRouter.ai
6. Implementacja logowania akcji AI
7. Implementacja obsługi błędów
8. Konfiguracja limitów zapytań
