# Plan implementacji widoków aplikacji HealthyMeal

## 1. Przegląd

Celem jest wdrożenie kompletnego zestawu widoków zgodnie z PRD: logowania/rejestracji, listy przepisów, szczegółów przepisu, formularza dodawania/edycji, modalu AI (generowanie/modyfikacja), profilu użytkownika oraz strony 404.

## 2. Routing widoków

- `/auth/login` i `/auth/register` – modalne formularze autoryzacji
- `/` – strona główna z listą przepisów
- `/recipes/new` – formularz dodawania (modal)
- `/recipes/:id` – widok szczegółów przepisu
- `/recipes/:id/edit` – formularz edycji (modal)
- Modal AI: wywoływany z `/` i `/recipes/:id`
- `/profile` – zarządzanie preferencjami
- `*` – strona „404” lub przekierowanie do `/auth/login`

## 3. Struktura komponentów

```
AppLayout
├─ TopNav
├─ AuthDialog (LoginDialog, RegisterDialog)
├─ Routes
│  ├─ HomePage
│  │  ├─ FilterInput
│  │  ├─ RecipeCardList → RecipeCard
│  │  └─ AIModalTrigger
│  ├─ RecipeDetailPage
│  │  ├─ RecipeContent
│  │  └─ ActionPanel (Edit, Delete, AI)
│  ├─ RecipeFormModal (dla new i edit)
│  ├─ ProfilePage
│  │  └─ PreferenceList → PreferenceChip
│  └─ PageNotFound
└─ ConfirmDialog, Spinner, Toast
```

## 4. Szczegóły komponentów

### TopNav

- Przeznaczenie: nawigacja globalna, dark mode, logout
- Elementy: logo (`<Link to="/"/>`), przycisk profil, wyloguj, toggle motyw
- Zdarzenia: onClick logout → supabase.auth.signOut()
- Brak walidacji
- Props: brak (kontekst z AuthContext)

### AuthDialog

- Formularz email + hasło, przyciski Log in / Sign up, inline walidacja (zod)
- Zdarzenia: onSubmit → wywołanie API supabase.auth
- Walidacja: email (format), password (min 6)
- Typy: `AuthFormValues { email: string; password: string }`
- Props: `mode: 'login' | 'register', onSuccess: ()=>void`

### HomePage

- Pokazuje FilterInput (search), przyciski Add & AI
- Hook: `useFetchRecipes({ limit, offset, sort, order })`
- Obsługa stanu: `filterText`, `isAIModalOpen`
- Reaguje na onChange filter → odświeża listę
- Zdarzenia: click Add → otwórz RecipeFormModal; click AI → otwórz AIModal

### RecipeCard

- Wyświetla tytuł, skrót treści, datę, hover toolbar (Edit, Delete, AI)
- Zdarzenia: onClick każdej akcji → wywołanie odpowiednich handlerów z contextu
- Props: `recipe: RecipeListItemVM, onEdit(id), onDelete(id), onAI(id)`
- Brak walidacji

### RecipeDetailPage

- Wyświetla pełne dane przepisu, metadata
- Zdarzenia: Edit → otwórz RecipeFormModal, Delete → ConfirmDialog, Modify AI → AIModal
- Typy: `RecipeDetailVM = RecipeDto`

### RecipeFormModal

- Pola: Title (Input, required), Content (Textarea, required, max 5000), AdditionalParams (Textarea, optional, max 5000)
- Zdarzenia: onSubmit → POST lub PUT `/api/recipes` lub `/api/recipes/:id`
- Walidacja: tytuł nie pusty, content nie pusty, długości zgodne
- Props: `initial?: RecipeBasicDto, onSuccess: ()=>void`

### AIModal

- Pola: AdditionalParams (Textarea, optional, max 5000)
- Wywołuje POST `/api/ai/generate-recipe` lub `/api/ai/modify-recipe/:id`
- Pokazuje loader, potem podgląd wyników: `GeneratedRecipeDto` lub `ModifiedRecipeDto`
- Daje opcje: Accept (save), Reject (zamknij)
- Save wywołuje POST `/api/ai/save-recipe` z `is_new` lub `original_recipe_id`
- Props: `mode: 'generate'|'modify', original?: RecipeReferenceDto`

### ProfilePage

- Wyświetla email, data, statystyki (ilość przepisów, AI-generated)
- Lista `PreferenceChip` z kategorią i wartością
- Możliwość dodania/edycji/usunięcia → wywołania API `/api/preferences` (GET, POST, PUT, DELETE)
- Walidacja: max 50 preferencji, wartość ≤50 znaków

### PreferenceChip

- Pokaż wartość, przyciski edytuj, usuń
- Zdarzenia: onEdit(value) otwórz inline input, onDelete → ConfirmDialog
- Props: `preference: PreferenceDto, onUpdate, onDelete`

### PageNotFound

- Prosty komunikat, przycisk Home lub Login

## 5. Typy

- Importować z `src/types.ts`: `RecipeDto`, `RecipeBasicDto`, `RecipeReferenceDto`, `GeneratedRecipeDto`, `ModifiedRecipeDto`, `PreferenceDto`, `PaginatedRecipesDto`, `PaginatedPreferencesDto`
- Nowe ViewModel:
  - `RecipeListItemVM extends RecipeDto`
  - `AuthFormValues { email: string; password: string }`
  - `RecipeFormValues { title: string; content: string; additional_params?: string }`
  - `AIModalValues { additional_params?: string }`

## 6. Zarządzanie stanem

- Contexty: `AuthContext`, `RecipesContext`, `ProfileContext` w `src/hooks`
- Hooki:
  - `useAuth()` – stan sesji, logout
  - `useFetchRecipes(params)` – zwraca `{ data, isLoading, error, refetch }`
  - `useRecipe(id)` – fetch detail
  - `useMutationCreate/Update/DeleteRecipe` – mutacje
  - `useAI()` – generate, modify, save
  - `usePreferences()` – CRUD preferencji
- Lokalny stan w komponentach dla formularzy i modali

## 7. Integracja API

| Akcja              | Endpoint                         | Req Type                  | Resp Type                 |
| ------------------ | -------------------------------- | ------------------------- | ------------------------- |
| Lista przepisów    | GET `/api/recipes`               | —                         | `PaginatedRecipesDto`     |
| Przepis detail     | GET `/api/recipes/:id`           | —                         | `RecipeDto`               |
| Dodaj przepis      | POST `/api/recipes`              | `CreateRecipeCommand`     | `RecipeDto`               |
| Edytuj przepis     | PUT `/api/recipes/:id`           | `UpdateRecipeCommand`     | `RecipeDto`               |
| Usuń przepis       | DELETE `/api/recipes/:id`        | —                         | `{ success: true }`       |
| Generuj AI         | POST `/api/ai/generate-recipe`   | `GenerateRecipeCommand`   | `GeneratedRecipeDto`      |
| Modyfikuj AI       | POST `/api/ai/modify-recipe/:id` | `ModifyRecipeCommand`     | `ModifiedRecipeDto`       |
| Zapisz AI result   | POST `/api/ai/save-recipe`       | `SaveRecipeCommand`       | `RecipeDto`               |
| Lista preferencji  | GET `/api/preferences`           | —                         | `PaginatedPreferencesDto` |
| Dodaj preferencję  | POST `/api/preferences`          | `CreatePreferenceCommand` | `PreferenceDto`           |
| Edytuj preferencję | PUT `/api/preferences/:id`       | `UpdatePreferenceCommand` | `PreferenceDto`           |
| Usuń preferencję   | DELETE `/api/preferences/:id`    | —                         | 204 No Content            |

## 8. Interakcje użytkownika

- Logowanie/Rejestracja → przekierowanie na `/profile` lub `/`
- Wpisywanie filtra → debounce i odświeżenie listy
- Dodawanie/edycja przepisu → walidacja, spinner, Toast
- Usuwanie przepisu/preferencji → potwierdzenie
- Generowanie/modyfikacja AI → loader w modalu, podgląd, decyzja accept/reject
- Zarządzanie preferencjami → inline edycja, ograniczenia ilości i długości

## 9. Warunki i walidacja

- Title/content: wymagane, długość ≥1
- additional_params: opcjonalne, max 5000 znaków
- Preferencja: wartość ≤50 znaków, max 50 elementów
- Na poziomie formularzy użyć `yup`/`zod` lub wbudowanych reguł HTML5

## 10. Obsługa błędów

- 401 → przekierowanie do `/auth/login`
- 404 → toast + nawigacja do listy lub 404 Page
- 400/422 → wyświetlenie szczegółów walidacji pod polami
- 500 → ogólny komunikat „Błąd serwera”, możliwość retry

## 11. Kroki implementacji

1. Utworzyć pliki routingu w `src/pages/*`
2. Zaimplementować `AppLayout` i `TopNav`
3. Stworzyć `AuthDialog` z formularzami i hookiem `useAuth`
4. Napisać hooki fetchujące: recipes, recipe, mutacje CRUD, AI, preferencje
5. Wdrożyć HomePage z filterem i listą `RecipeCard`
6. Dodać `RecipeDetailPage` i `ActionPanel`
7. Utworzyć `RecipeFormModal` wspólny dla new/edit
8. Zaimplementować `AIModal` i logikę save
9. Wdrożyć `ProfilePage` i `PreferenceChip`
10. Dodać `ConfirmDialog`, `Spinner`, `Toast` globalnie
11. Testy manualne, responsywność, dostępność, prettify + ESLint
