# Architektura UI dla HealthyMeal

## 1. Przegląd struktury UI

Aplikacja HealthyMeal składa się z głównego layoutu z górnym paskiem nawigacyjnym, modalnych formularzy logowania/rejestracji oraz czterech kluczowych widoków: Strona główna (lista przepisów), Szczegóły przepisu, Formularz dodawania/edycji przepisu oraz Profil użytkownika.

## 2. Lista widoków

### 2.1. Widok logowania / rejestracji

- Ścieżka: `/auth/login` i `/auth/register`
- Cel: uwierzytelnienie użytkownika
- Kluczowe informacje: formularze email + hasło, przyciski "Zaloguj", "Zarejestruj"
- Komponenty: `Dialog.LogIn`, `Dialog.SignUp`, `Button`, `Input`, `Toast`
- UX: łatwe przełączanie między logowaniem a rejestracją, natychmiastowe walidacje inline
- Dostępność: role dialog, focus trap, etykiety ARIA
- Bezpieczeństwo: walidacja front-end + obsługa błędów API (401)

### 2.2. Strona główna (lista przepisów)

- Ścieżka: `/`
- Cel: przegląd, filtrowanie i szybkie akcje na przepisach
- Kluczowe informacje: siatka `RecipeCard`, filtr po tytule, przyciski "Dodaj przepis" i "Generuj przepis"
- Komponenty: `FilterInput`, `Button`, `RecipeCard`, `ConfirmDialog`, `Spinner`
- UX: natychmiastowy loader w miejscu siatki, dostępny infinite scroll
- Dostępność: aria-labels dla filtrów i przycisków akcji
- Bezpieczeństwo: obsługa błędów (500, 401) z redirectem na `/auth/login`

### 2.3. Widok szczegółów przepisu

- Ścieżka: `/recipes/:id`
- Cel: prezentacja szczegółów wybranego przepisu i dostęp do akcji edycji
- Kluczowe informacje: tytuł, data utworzenia i modyfikacji, lista składników, lista instrukcji
- Komponenty: `StatText`, `ActionPanel` (z przyciskami Edytuj, Usuń, Modyfikuj AI), `Spinner`
- UX: klarowny podział treści i panelu akcji, potwierdzenie usuwania modalem
- Dostępność: sekcje `h1`, `role=document`, opis akcji ARIA
- Bezpieczeństwo: RLS via middleware, 404 dla nieistniejącego ID

### 2.4. Formularz dodawania / edycji przepisu

- Ścieżki: `/recipes/new`, `/recipes/:id/edit` (modal)
- Cel: dodawanie i aktualizacja przepisów
- Kluczowe informacje: pola Title, Content (textarea), AdditionalParams
- Komponenty: `Form`, `Input`, `Textarea`, `Button`, `Toast`, `Spinner`
- UX: walidacja na żywo (limit znaków), podpowiedzi, przycisk zapisu i anulowania
- Dostępność: etykiety, aria-invalid, aria-describedby dla błędów
- Bezpieczeństwo: walidacja, obsługa błędów 400/401/500

### 2.5. Generowanie / modyfikacja przez AI (modal)

- Ścieżka: otwierany z `/` lub `/recipes/:id`
- Cel: generowanie lub modyfikacja treści przepisu z wykorzystaniem AI
- Kluczowe informacje: pole AdditionalParams, pole z opcjonalnym bazowym przepisem, przycisk "Generuj", podgląd wyniku, opcje zapisania
- Komponenty: `Dialog`, `Textarea`, `Button`, `Spinner`, `Toast`
- UX: loader w czasie oczekiwania, możliwość odrzucenia lub zaakceptowania
- Dostępność: role dialog, focus trap
- Bezpieczeństwo: obsługa błędów AI API

### 2.6. Profil użytkownika

- Ścieżka: `/profile`
- Cel: zarządzanie preferencjami i podgląd statystyk
- Kluczowe informacje: Adres email i data utworzenia, `StatCard` (liczba przepisów, liczba AI-generated), lista `PreferenceChip`
- Komponenty: `PreferenceChip`, `StatCard`, `Button`, `ConfirmDialog`, `Spinner`
- UX: inline edycja/usuwanie PreferenceChip, wyświetlanie wszystkich preferencji, potwierdzenie usunięcia
- Dostępność: aria-label dla preferencji i akcji, opis stanów pustych
- Bezpieczeństwo: obsługa RLS, walidacja limitów (50 preferencji)

### 2.7. Widok 404 / brak autoryzacji

- Ścieżka: `*`, `/auth/login` przekierowanie
- Cel: informowanie o nieistniejącej stronie lub braku dostępu
- Komponenty: `PageNotFound`, automatyczne przekierowanie po 5s
- UX: jasny komunikat, przycisk powrotu lub logowania
- Dostępność: aria-live dla komunikatu

## 3. Mapa podróży użytkownika

1. Nowy użytkownik wchodzi na `/auth/login`, widzi modal logowania
2. Rejestracja w modalnym formularzu → po sukcesie przekierowanie na `/`
3. Automatyczne przekierowanie do `/profile` w celu zachęcenia do opcjonalnego uzupełnienia preferencji
4. Po uzupełnieniu preferencji: przejście na Strona główna z listą przepisów (pusta kolekcja)
5. Użytkownik dodaje nowy przepis lub generuje AI → lista odświeża się
6. Kliknięcie karty przepisu → przejście do `/recipes/:id`
7. W Szczegółach użytkownik może edytować, usuwać lub modyfikować AI
8. W menu TopNav użytkownik może przejść do Profilu lub wylogować się
9. Wylogowanie czyści kontekst i przekierowuje na `/auth/login`

## 4. Układ i struktura nawigacji

- **TopNav**: logo (link `/`), `NavLink` do `/profile`, `DarkModeToggle`, `Button` Wyloguj
- **Akcje kontekstowe**: przyciski "Dodaj przepis" i "Generuj przepis" na Stronie głównej
- **BreadCrumbs**: opcjonalne w `/recipes/:id` (Strona główna > Szczegóły)
- **Modal dialogs**: ładowane w main layout, focus trap

## 5. Kluczowe komponenty

- `TopNav` – pasek nawigacyjny z linkami i kontrolą dark mode
- `PreferenceChip` – dymek z inline edycją i usuwaniem preferencji
- `RecipeCard` – karta przepisu z hover toolbar (Edytuj, Usuń, AI)
- `ConfirmDialog` – uniwersalny modal potwierdzania akcji
- `StatCard` – wyświetlanie metryk (liczba przepisów, AI-generated)
- `Spinner`/`Shimmer` – lokalne loadery w miejscach fetchowania
- `Toast` – komunikaty sukcesu i błędów (shadcn/ui)
- Custom hooks: `useFetchRecipes`, `useFetchPreferences` i konteksty `AuthContext`, `RecipesContext`, `ProfileContext`
