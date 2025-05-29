# Plan implementacji zastąpienia danych mockowych przepisów

## 1. Przegląd

Celem tego planu jest całkowite zastąpienie danych mockowych przepisów realnymi danymi pobieranymi z bazy danych Supabase w aplikacji HealthyMeal. Implementacja obejmuje:

- Podłączenie hooka `useFetchRecipes` do rzeczywistego API zamiast mockowych danych
- Naprawienie serwisu `RecipeService` poprzez dodanie właściwej integracji z Supabase
- Aktualizację statystyk przepisów w profilu użytkownika
- Zapewnienie poprawnej obsługi błędów i stanów ładowania
- Implementację wszystkich operacji CRUD (Create, Read, Update, Delete)

Zmiana dotyczy głównie strony głównej aplikacji (lista przepisów) oraz sekcji statystyk w profilu użytkownika.

## 2. Struktura zmian w plikach

```
src/
├── hooks/
│   ├── useRecipes.ts          # Zastąpienie mockowych danych wywołaniami API
│   ├── useRecipe.ts           # Hook dla pojedynczego przepisu
│   └── useRecipeMutations.ts  # Hooki dla operacji CREATE/UPDATE/DELETE
├── lib/services/
│   └── recipe.service.ts      # Naprawienie problemów z pobieraniem danych
├── components/
│   ├── HomePage.tsx           # Aktualizacja obsługi błędów i stanów
│   └── ProfilePage.tsx        # Zastąpienie mockowych statystyk realnymi danymi
├── db/
│   └── supabase.client.ts     # Dodanie eksportu klienta (jeśli brakuje)
└── types.ts                   # Dodanie nowych typów jeśli będzie potrzeba
```

## 3. Szczegóły zmian w plikach

### useRecipes.ts
- **Opis**: Hook odpowiedzialny za pobieranie listy przepisów z sortowaniem i wyszukiwaniem bez paginacji
- **Główne elementy**: 
  - Usunięcie mockowych przepisów
  - Dodanie rzeczywistych wywołań fetch do `/api/recipes`
  - Zachowanie istniejącej logiki sortowania i filtrowania
- **Obsługiwane zdarzenia**: 
  - Pobieranie listy przepisów z API
  - Refetch po zmianach
  - Obsługa stanów ładowania i błędów
- **Warunki walidacji**: 
  - Sprawdzenie autoryzacji użytkownika
  - Walidacja parametrów sortowania (sort, order)
  - Walidacja parametrów wyszukiwania

### RecipeService.ts
- **Opis**: Serwis backendowy obsługujący wszystkie operacje na przepisach
- **Główne elementy**:
  - Zweryfikowanie poprawności implementacji integracji z supabase
  - Implementacja wszystkich metod z prawdziwymi zapytaniami do bazy
  - Poprawna obsługa Row-Level Security (RLS)
- **Obsługiwane zdarzenia**:
  - `getUserRecipes()` - pobieranie listy
  - `getRecipe()` - pobieranie pojedynczego przepisu
  - `createRecipe()` - tworzenie nowego przepisu
  - `updateRecipe()` - aktualizacja istniejącego przepisu
  - `deleteRecipe()` - usuwanie przepisu
- **Warunki walidacji**:
  - Sprawdzenie czy użytkownik jest właścicielem przepisu (RLS)
  - Walidacja długości pól (title, content max 5000 znaków, additional_params max 5000 znaków)
  - Sprawdzenie czy przepis istnieje przed operacjami UPDATE/DELETE

### HomePage.tsx
- **Opis**: Główny komponent strony startowej wyświetlający listę przepisów
- **Główne elementy**:
  - Aktualizacja obsługi błędów sieciowych
  - Ulepszenie komunikatów dla różnych typów błędów
  - Dodanie retry logic dla nieudanych żądań
- **Obsługiwane zdarzenia**:
  - Wyświetlanie przepisów z API
  - Obsługa stanów pustej listy vs błędów API
  - Retry po błędach sieciowych, ale bez wpadania w nieskończoną pętlę
- **Warunki walidacji**:
  - Sprawdzenie czy użytkownik jest zalogowany
  - Walidacja odpowiedzi API przed renderowaniem

### ProfilePage.tsx
- **Opis**: Strona profilu użytkownika z statystykami przepisów
- **Główne elementy**:
  - Zastąpienie mockowych statystyk realnymi danymi
  - Dodanie nowego API endpoint dla statystyk
  - Obsługa ładowania statystyk
- **Obsługiwane zdarzenia**:
  - Pobieranie statystyk przepisów z API
  - Wyświetlanie liczby wszystkich przepisów i tylko przepisów wygenerowanych przez AI
- **Warunki walidacji**:
  - Sprawdzenie autoryzacji użytkownika
  - Walidacja danych statystyk przed wyświetleniem

## 4. Typy

### Nowe typy dla API
```typescript
// Typ dla błędów API
export interface APIError {
  error: string;
  details?: string;
  statusCode?: number;
}

// Typ dla statystyk użytkownika
export interface UserStatsDto {
  totalRecipes: number;
  aiGeneratedRecipes: number;
  lastRecipeDate?: string;
}

// Rozszerzenie istniejących typów
export interface RecipeApiResponse {
  data?: RecipeDto;
  error?: APIError;
}

export interface RecipesListApiResponse {
  data?: PaginatedRecipesDto;
  error?: APIError;
}
```

## 5. Zarządzanie stanem

- **useState**: Zarządzanie lokalnymi stanami komponentów (loading, error, data)
- **useEffect**: Ładowanie danych przy montowaniu komponentów i przy zmianie parametrów
- **Custom hooks**:
  - `useRecipes()` - zarządzanie listą przepisów z cache'owaniem
  - `useUserStats()` - nowy hook do pobierania statystyk użytkownika
  - `useRecipeOperations()` - hook do operacji CRUD na przepisach

## 6. Integracja API

### Endpointy do wykorzystania:
- `GET /api/recipes` - lista przepisów (już istnieje)
- `GET /api/recipes/:id` - pojedynczy przepis (już istnieje)
- `POST /api/recipes` - tworzenie przepisu (już istnieje)
- `PUT /api/recipes/:id` - aktualizacja przepisu (już istnieje)
- `DELETE /api/recipes/:id` - usuwanie przepisu (już istnieje)
- `GET /api/users/stats` - statystyki użytkownika (do utworzenia)

### Typy żądań i odpowiedzi:
```typescript
// GET /api/recipes
Request: URLSearchParams { sort, order, search? }
Response: PaginatedRecipesDto | { error: string }

// POST /api/recipes
Request: CreateRecipeCommand
Response: RecipeDto | { error: string }

// GET /api/users/stats
Request: UserStatsRecipes
Response: UserStatsDto | { error: string }
```

## 7. Interakcje użytkownika

### Strona główna:
1. **Ładowanie listy przepisów**: Automatyczne pobieranie przy montowaniu komponentu
2. **Wyszukiwanie**: Debounced search z automatycznym wywołaniem API
3. **Sortowanie**: Zmiana parametrów sortowania z natychmiastowym odświeżeniem
4. **Operacje CRUD**: Dodawanie, edycja, usuwanie przepisów z optimistic updates
5. **Retry**: Przycisk "Spróbuj ponownie" przy błędach sieciowych

### Profil użytkownika:
1. **Ładowanie statystyk**: Automatyczne pobieranie przy montowaniu
2. **Odświeżanie**: Aktualizacja statystyk po operacjach na przepisach
3. **Obsługa błędów**: Wyświetlanie komunikatów przy problemach z ładowaniem

## 8. Warunki i walidacja

### Walidacja po stronie frontendu:
- Sprawdzenie czy użytkownik jest zalogowany przed wywołaniami API
- Walidacja parametrów wyszukiwania i sortowania
- Sprawdzenie poprawności danych przed wysłaniem na serwer

### Walidacja po stronie API:
- Autoryzacja poprzez Supabase Auth middleware
- Row-Level Security (RLS) w bazie danych
- Walidacja schematów za pomocą Zod
- Sprawdzenie limitów długości pól zgodnie z PRD

### Warunki biznesowe:
- Użytkownik może przeglądać tylko swoje przepisy
- Maksymalne długości: title (1000 znaków), content (5000 znaków), additional_params (5000 znaków)
- Sortowanie dostępne po: created_at, updated_at, title

## 9. Obsługa błędów

### Typy błędów do obsłużenia:
1. **Błędy sieciowe (NetworkError)**:
   - Brak połączenia internetowego
   - Timeout żądania
   - Rozwiązanie: Retry logic z exponential backoff

2. **Błędy autoryzacji (401)**:
   - Wygasła sesja użytkownika
   - Rozwiązanie: Przekierowanie do strony logowania

3. **Błędy walidacji (400, 422)**:
   - Nieprawidłowe dane wejściowe
   - Rozwiązanie: Wyświetlenie szczegółowych komunikatów błędów

4. **Błędy serwera (500)**:
   - Problemy z bazą danych
   - Problemy z Supabase
   - Rozwiązanie: Komunikat ogólny + możliwość retry

5. **Błędy nie znaleziono (404)**:
   - Przepis nie istnieje lub został usunięty
   - Rozwiązanie: Przekierowanie do listy przepisów

### Strategie obsługi:
- **Graceful degradation**: Wyświetlanie częściowych danych gdy to możliwe
- **Optimistic updates**: Natychmiastowe odzwierciedlenie zmian w UI
- **Rollback**: Przywracanie poprzedniego stanu przy błędach
- **Toast notifications**: Informowanie użytkownika o sukcesach i błędach

## 10. Kroki implementacji

### Etap 1: Przygotowanie infrastruktury
1. Sprawdzenie eksportu `supabaseClient` w `src/db/supabase.client.ts`
2. Dodanie nowych typów do `src/types.ts`
3. Utworzenie nowego endpointu `GET /api/users/stats` dla statystyk użytkownika

### Etap 2: Implementacja serwisu RecipeService
1. Sprawdzenie importu supabaseClient w `RecipeService`
2. Implementacja metody `getUserRecipes()` z prawdziwymi zapytaniami SQL
3. Implementacja pozostałych metod: `getRecipe()`, `createRecipe()`, `updateRecipe()`, `deleteRecipe()`
4. Dodanie poprawnej obsługi błędów i logowania

### Etap 3: Aktualizacja hooków
1. Refaktoryzacja `useRecipes.ts` - zastąpienie mockowych danych wywołaniami fetch
2. Aktualizacja `useRecipe.ts` - podłączenie do API
3. Modyfikacja `useRecipeMutations.ts` - zapewnienie działania operacji CRUD
4. Utworzenie nowego hooka `useUserStats.ts` dla statystyk profilu
5. Dodanie optimistic updates i retry logic

### Etap 4: Aktualizacja komponentów
1. Aktualizacja `HomePage.tsx` - usunięcie referencji do mockowych danych
2. Ulepszenie obsługi błędów i komunikatów w `HomePage.tsx`
3. Aktualizacja `ProfilePage.tsx` - podłączenie do prawdziwych statystyk
4. Dodanie loading states i error boundaries gdzie potrzeba

### Etap 5: Testowanie i finalizacja (opcjonalnie)
1. Dokumentacja zmian i aktualizacja README, ale tylko jeśli będzie potrzebna
2. Implementacja cache'owania wyników jeśli potrzeba
3. Optymalizacja UX (skeleton loading, better error states)