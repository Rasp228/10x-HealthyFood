# Plan implementacji widoku szczegółów przepisu w modalu

## 1. Przegląd

Celem implementacji jest dodanie funkcjonalności wyświetlania pełnych szczegółów przepisu w postaci modala na stronie głównej aplikacji HealthyMeal. Modal będzie się otwierał po kliknięciu w kartę przepisu z listy i umożliwi użytkownikowi nie tylko przeczytanie pełnej treści przepisu, ale także wykonanie wszystkich operacji dostępnych z poziomu listy (edycja, usuwanie, modyfikacja AI).

Główne cele implementacji:
- Wyświetlanie pełnych szczegółów przepisu w atrakcyjnym modalu
- Zachowanie wszystkich funkcjonalności zarządzania przepisem
- Zapewnienie responsywności na urządzeniach mobilnych
- Optymalizacja UX poprzez płynną navigację bez przeładowywania strony
- Zachowanie spójności z obecnym designem aplikacji
- **Wykorzystanie, usuwanie lub modyfikowanie istniejących komponentów i unikanie duplikacji kodu**

## 2. Struktura zmian w plikach

```
src/
├── components/
│   ├── HomePage.tsx                    # Aktualizacja obsługi kliknięć w karty
│   ├── RecipeCard.tsx                  # Dodanie obsługi kliknięcia dla szczegółów
│   ├── RecipeViewModal.tsx             # Nowy główny komponent modala (NOWY)
│   ├── RecipeDetailContent.tsx         # Refaktor RecipeDetailPage -> komponent content (REFAKTOR)
│   ├── RecipeDetailPage.tsx            # Modyfikacja - wykorzysta RecipeDetailContent (MODYFIKACJA)
│   └── ActionPanel.tsx                 # Możliwe rozszerzenie o dodatkowe props (MODYFIKACJA)
├── hooks/
│   ├── useRecipeModal.ts               # Hook zarządzający stanem modala (NOWY)
│   └── useRecipe.ts                    # Bez zmian - już dobrze zaimplementowany
└── types.ts                            # Dodanie nowych typów dla modala
```

## 3. Szczegóły zmian w plikach

### HomePage.tsx
- **Opis**: Aktualizacja komponentu strony głównej o obsługę modala szczegółów przepisu
- **Główne elementy**: 
  - Dodanie stanu modala szczegółów
  - Integracja z hookiem `useRecipeModal`
  - Przekazanie funkcji otwierania modala do `RecipeCard`
- **Obsługiwane zdarzenia**:
  - Otwieranie modala szczegółów po kliknięciu w kartę przepisu
  - Synchronizacja listy po operacjach w modalu (edycja, usuwanie)
  - Zarządzanie stanem ładowania podczas operacji
- **Warunki walidacji**:
  - Sprawdzenie czy użytkownik jest zalogowany
  - Walidacja istnienia przepisu przed otwarciem modala
  - Obsługa błędów ładowania szczegółów

### RecipeCard.tsx
- **Opis**: Modyfikacja karty przepisu o możliwość kliknięcia dla szczegółów
- **Główne elementy**:
  - Dodanie nowego callbacka `onView` do props
  - Dodanie klikalności całej karty z zachowaniem istniejących akcji
  - Wizualne wskazanie, że karta jest klikalna
- **Obsługiwane zdarzenia**:
  - Kliknięcie w kartę (poza przyciskami akcji) otwiera modal szczegółów
  - Zachowanie obecnych akcji (edytuj, usuń, AI) przy kliknięciu w przyciski
  - Hover effects wskazujące interaktywność
- **Warunki walidacji**:
  - Sprawdzenie czy callback `onView` jest dostępny
  - Event propagation - zapobieganie otwieraniu modala przy kliknięciu w przyciski akcji

### RecipeViewModal.tsx (NOWY)
- **Opis**: Główny komponent modala do wyświetlania szczegółów przepisu
- **Główne elementy**:
  - Struktura modala z nagłówkiem, treścią i stopką
  - Integracja z refaktoryzowanym komponentem `RecipeDetailContent`
  - Obsługa zamykania modala (ESC, kliknięcie poza modal, przycisk X)
  - Responsive design dla urządzeń mobilnych
- **Obsługiwane zdarzenia**:
  - Otwieranie/zamykanie modala
  - Obsługa klawiszy (ESC do zamknięcia)
  - Kliknięcie poza modal zamyka go
  - Przekazywanie akcji do nadrzędnych komponentów
- **Warunki walidacji**:
  - Sprawdzenie czy przepis jest załadowany przed wyświetleniem
  - Obsługa stanów ładowania i błędów
  - Walidacja uprawnień użytkownika do przepisu

### RecipeDetailContent.tsx (REFAKTOR z RecipeDetailPage.tsx)
- **Opis**: Refaktoryzowany komponent z RecipeDetailPage, zawierający logikę wyświetlania szczegółów przepisu
- **Główne elementy**:
  - Wyciągnięcie logiki renderowania z RecipeDetailPage
  - Wyświetlanie pełnego tytułu i treści przepisu z Markdown
  - Wyświetlanie metadanych (data utworzenia, modyfikacji, źródło AI)
  - Wyświetlanie dodatkowych parametrów jako tagów
  - Integracja z ActionPanel dla akcji
- **Obsługiwane zdarzenia**:
  - Renderowanie treści przepisu z zachowaniem formatowania
  - Obsługa długich tekstów z odpowiednim layoutem
  - Wyświetlanie etykiet i kategorii
  - Wszystkie akcje (edycja, usuwanie, AI) z istniejącej implementacji
- **Warunki walidacji**:
  - Walidacja istnienia danych przepisu
  - Sanityzacja treści przed wyświetleniem (już zaimplementowana z marked.js)
  - Sprawdzenie długości treści dla odpowiedniego formatowania
- **Zmiany względem oryginalnego RecipeDetailPage**:
  - Usunięcie przycisku "Powrót" (nie potrzebny w modalu)
  - Dodanie props dla callbacków akcji zamiast bezpośredniego window.location.href
  - Możliwość przekazania dodatkowych props dla customizacji wyglądu

### RecipeDetailPage.tsx (MODYFIKACJA)
- **Opis**: Modyfikacja istniejącego komponentu strony szczegółów by wykorzystał nowy RecipeDetailContent
- **Główne elementy**:
  - Zachowanie istniejącej funkcjonalności dla routing `/recipes/[id]`
  - Wykorzystanie nowego komponentu RecipeDetailContent
  - Dodanie przycisku "Powrót" specyficznego dla strony
- **Obsługiwane zdarzenia**:
  - Zachowanie wszystkich istniejących funkcjonalności
  - Wykorzystanie wspólnej logiki z modalem
- **Warunki walidacji**:
  - Zachowanie wszystkich istniejących walidacji
  - Kompatybilność wsteczna z istniejącym routingiem

### ActionPanel.tsx (EWENTUALNA MODYFIKACJA)
- **Opis**: Istniejący komponent może zostać rozszerzony o dodatkowe właściwości jeśli będzie potrzeba
- **Główne elementy**:
  - Zachowanie istniejącej funkcjonalności
  - Ewentualne dodanie props dla stanów ładowania akcji
  - Możliwość customizacji layoutu (np. vertical vs horizontal)
- **Obsługiwane zdarzenia**:
  - Wszystkie istniejące akcje bez zmian
  - Ewentualnie dodatkowe stany wizualne
- **Warunki walidacji**:
  - Zachowanie kompatybilności wstecznej
  - Dodanie tylko opcjonalnych props

### useRecipeModal.ts (NOWY)
- **Opis**: Hook zarządzający stanem modala szczegółów przepisu
- **Główne elementy**:
  - Stan otwarcia/zamknięcia modala
  - ID aktualnie wyświetlanego przepisu
  - Integracja z istniejącym hookiem `useRecipe` dla ładowania szczegółów
  - Cache ostatnio wyświetlanych przepisów
- **Obsługiwane zdarzenia**:
  - Otwieranie modala z określonym ID przepisu
  - Zamykanie modala z czyszczeniem stanu
  - Auto-ładowanie szczegółów przy otwieraniu
  - Optymistyczne cache'owanie ostatnich przepisów
- **Warunki walidacji**:
  - Walidacja prawidłowego ID przepisu
  - Sprawdzenie dostępności danych przed otwarciem
  - Obsługa błędów ładowania

## 4. Typy

```typescript
// Nowe typy dla modala szczegółów
export interface RecipeViewModalProps {
  isOpen: boolean;
  recipeId: number | null;
  onClose: () => void;
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
  onSuccess?: () => void;
}

// Nowy typ dla refaktoryzowanego komponentu zawartości
export interface RecipeDetailContentProps {
  recipe: RecipeDto;
  isLoading?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
  onSuccess?: () => void;
  showBackButton?: boolean; // dla rozróżnienia strony vs modala
  className?: string; // dla customizacji stylów
}

// Hook dla modala
export interface UseRecipeModalResult {
  isOpen: boolean;
  recipeId: number | null;
  recipe: RecipeDto | null;
  isLoading: boolean;
  error: Error | null;
  openModal: (id: number) => void;
  closeModal: () => void;
  refetch: () => void;
}

// Rozszerzenie istniejących props
export interface RecipeCardProps {
  recipe: RecipeDto;
  onView?: (id: number) => void;  // Nowy callback
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
  onAI?: (id: number) => void;
}

// Dodatkowe typy dla optymalizacji
export interface RecipeCache {
  [id: number]: {
    recipe: RecipeDto;
    timestamp: number;
  };
}

export interface ModalState {
  isOpen: boolean;
  recipeId: number | null;
  cache: RecipeCache;
}

// Rozszerzenie ActionPanel (opcjonalne)
export interface ActionPanelProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onAI?: () => void;
  isEditing?: boolean;
  isDeleting?: boolean;
  isAIProcessing?: boolean;
  layout?: 'horizontal' | 'vertical'; // dla różnych kontekstów
}
```

## 5. Zarządzanie stanem

### Stan główny aplikacji (HomePage)
- **useRecipeModal**: Główny hook zarządzający stanem modala
- **Synchronizacja**: Odświeżanie listy po operacjach w modalu
- **Integracja z istniejącymi hookami**: Wykorzystanie `useRecipe` bez modyfikacji

### Stan lokalny komponentów
- **RecipeViewModal**: Stan UI modala (animacje, focus management)
- **RecipeDetailContent**: Stany dla operacji (edycja, usuwanie, AI) - przeniesione z RecipeDetailPage
- **Cache management**: Przechowywanie ostatnio przeglądanych przepisów

### Optymalizacja stanu
- **Lazy loading**: Ładowanie szczegółów tylko przy otwieraniu modala
- **Cache strategy**: Przechowywanie ostatnich 10 przepisów w pamięci
- **Error boundaries**: Obsługa błędów na poziomie modala
- **Reuse existing logic**: Wykorzystanie logiki z RecipeDetailPage

## 6. Integracja API

### Wykorzystywane endpointy
- **GET /api/recipes/:id**: Pobieranie szczegółów przepisu (już istnieje, używane przez `useRecipe`)
- **PUT /api/recipes/:id**: Aktualizacja przepisu (już istnieje)
- **DELETE /api/recipes/:id**: Usuwanie przepisu (już istnieje)
- **POST /api/ai/modify-recipe/:id**: Modyfikacja AI (już istnieje)

### Typy żądań i odpowiedzi
```typescript
// Wykorzystanie istniejących typów bez zmian
// GET /api/recipes/:id - już obsługiwane przez useRecipe
// Operacje z modala wykorzystują istniejące implementacje z RecipeDetailPage
```

### Strategie zapytań
- **Reuse existing implementations**: Wykorzystanie logiki z RecipeDetailPage i RecipeService
- **Optimistic updates**: Zachowanie istniejących implementacji
- **Error handling**: Wykorzystanie istniejącej obsługi błędów
- **Cache invalidation**: Integracja z istniejącymi mechanizmami

## 7. Interakcje użytkownika

### Na liście przepisów
1. **Kliknięcie w kartę przepisu**: Otwiera modal szczegółów
2. **Kliknięcie w przyciski akcji**: Wykonuje akcję bez otwierania modala (zachowanie bez zmian)
3. **Hover na karcie**: Zwiększa elevation, wskazuje klikalność

### W modalu szczegółów
1. **Wyświetlenie szczegółów**: Identyczne z obecną stroną `/recipes/[id]`
2. **Edycja przepisu**: Otwiera modal edycji (logika z RecipeDetailPage)
3. **Usuwanie przepisu**: Pokazuje dialog potwierdzenia, po usunięciu zamyka modal (logika z RecipeDetailPage)
4. **Modyfikacja AI**: Otwiera modal AI (logika z RecipeDetailPage)
5. **Zamykanie modala**: Klawisz ESC, kliknięcie X, kliknięcie poza modal

### Na stronie szczegółów (`/recipes/[id]`)
1. **Zachowanie istniejącej funkcjonalności**: Wszystkie operacje działają jak dotychczas
2. **Przycisk powrotu**: Pozostaje bez zmian
3. **Wspólna logika**: Wykorzystuje ten sam komponent co modal

### Responsywność
1. **Desktop**: Modal zajmuje maksymalnie 80% szerokości ekranu
2. **Tablet**: Modal zajmuje 90% szerokości z padding
3. **Mobile**: Modal w pełnej szerokości z zachowaniem marginesów

## 8. Warunki i walidacja

### Walidacja dostępu
- **Wykorzystanie istniejących mechanizmów**: RLS, autoryzacja z RecipeDetailPage
- **Dostępność przepisu**: Wykorzystanie logiki z `useRecipe` hook
- **Uprawnienia**: Zachowanie istniejących kontroli uprawnień

### Walidacja danych
- **Wykorzystanie istniejących walidacji**: Wszystkie sprawdzenia z RecipeDetailPage
- **Markdown processing**: Zachowanie istniejącej implementacji z marked.js
- **Formatowanie dat**: Wykorzystanie istniejącej logiki

### Walidacja UI/UX
- **Stan modala**: Sprawdzenie czy modal można otworzyć (brak innych modali)
- **Focus management**: Zarządzanie focusem przy otwieraniu/zamykaniu
- **Scroll lock**: Blokowanie scroll'u strony gdy modal jest otwarty

## 9. Obsługa błędów

### Wykorzystanie istniejących mechanizmów
- **Error handling z RecipeDetailPage**: Zachowanie wszystkich istniejących obsług błędów
- **Toast notifications**: Wykorzystanie istniejących implementacji
- **Loading states**: Przeniesienie logiki z RecipeDetailPage

### Dodatkowe błędy specyficzne dla modala
1. **Błędy otwierania modala**:
   - Modal już otwarty
   - **Rozwiązanie**: Sprawdzenie stanu przed otwarciem

2. **Błędy focus management**:
   - Problemy z nawigacją klawiaturą
   - **Rozwiązanie**: Implementacja proper ARIA i focus trapping

### Strategie obsługi
- **Error boundaries**: Przechwytywanie błędów na poziomie modala
- **Fallback UI**: Wykorzystanie istniejących implementacji
- **Graceful degradation**: Możliwość przejścia do strony szczegółów przy problemach z modalem

## 10. Kroki implementacji

### Etap 1: Refaktoryzacja istniejących komponentów
1. **Ekstraktowanie RecipeDetailContent** z RecipeDetailPage.tsx
   - Wyciągnięcie logiki renderowania do osobnego komponentu
   - Zachowanie wszystkich istniejących funkcjonalności
   - Dodanie props dla customizacji (showBackButton, callbacks)
2. **Modyfikacja RecipeDetailPage.tsx**
   - Wykorzystanie nowego RecipeDetailContent
   - Zachowanie przycisku powrotu
   - Testowanie kompatybilności wstecznej

### Etap 2: Implementacja infrastruktury modala
1. Dodanie nowych typów do `src/types.ts`
2. Utworzenie hooka `useRecipeModal.ts` z integracją z `useRecipe`
3. Testowanie podstawowej funkcjonalności cache'owania

### Etap 3: Implementacja komponentu modala
1. Utworzenie `RecipeViewModal.tsx` z wykorzystaniem RecipeDetailContent
2. Implementacja obsługi klawiatury i focus management
3. Dodanie responsywnych stylów
4. Testowanie podstawowej funkcjonalności wyświetlania

### Etap 4: Integracja z HomePage
1. Modyfikacja `RecipeCard.tsx` - dodanie obsługi kliknięcia
2. Aktualizacja `HomePage.tsx` - integracja z `useRecipeModal`
3. Testowanie otwierania/zamykania modala
4. Sprawdzenie responsywności na różnych urządzeniach

### Etap 5: Implementacja akcji w modalu
1. Integracja akcji edycji z istniejącym `RecipeFormModal`
2. Integracja akcji usuwania z istniejącym `ConfirmDialog`
3. Integracja akcji AI z istniejącym `AIModal`
4. Testowanie wszystkich operacji z poziomu modala
5. Sprawdzenie synchronizacji z listą przepisów

### Etap 6: Optymalizacja i finalizacja
1. Implementacja cache'owania przepisów w `useRecipeModal`
2. Dodanie animacji otwierania/zamykania modala
3. Optymalizacja accessibility (ARIA labels, focus management)
4. Testy kompatybilności wstecznej z istniejącą stroną szczegółów

### Etap 7: Testowanie i dokumentacja
1. Testowanie całego flow użytkownika
2. Sprawdzenie działania na różnych urządzeniach
3. Testy wydajności (szczególnie cache'owania)
4. Dokumentacja zmian i nowych komponentów

## 11. Korzyści z refaktoryzacji

### Eliminacja duplikacji kodu
- **Wspólna logika**: RecipeDetailContent używany w modalu i na stronie
- **Wspólne style**: Jednolity wygląd szczegółów przepisu
- **Wspólne hooki**: Wykorzystanie istniejącego `useRecipe`

### Utrzymanie kompatybilności
- **Istniejące routing**: Strona `/recipes/[id]` działa bez zmian
- **Istniejące komponenty**: ActionPanel, ConfirmDialog, RecipeFormModal, AIModal
- **Istniejące hooki**: useRecipe, useToast, useRecipeMutations

### Łatwość utrzymania
- **Jedna implementacja logiki**: Zmiany w jednym miejscu wpływają na modal i stronę
- **Consistent UX**: Identyczne zachowanie w różnych kontekstach
- **Reusable components**: Możliwość wykorzystania w przyszłych funkcjonalnościach 