# Specyfikacja architektury autentykacji - HealthyMeal

## 1. Architektura interfejsu użytkownika

### 1.1. Strony autentykacji

#### 1.1.1 Strona logowania (`/src/pages/auth/login.astro`)
- Statyczna strona renderowana po stronie serwera
- Zawiera komponent `<LoginForm />` renderowany po stronie klienta
- Obsługa przekierowań po pomyślnym logowaniu
- Wyświetlanie komunikatów o błędach sesji

#### 1.1.2 Strona rejestracji (`/src/pages/auth/register.astro`)
- Statyczna strona renderowana po stronie serwera
- Zawiera komponent `<RegisterForm />` renderowany po stronie klienta
- Obsługa przekierowań po pomyślnej rejestracji
- Linkowanie do strony logowania

#### 1.1.3 Strona resetowania hasła (`/src/pages/auth/reset-password.astro`)
- Statyczna strona renderowana po stronie serwera
- Zawiera komponent `<ResetPasswordForm />` renderowany po stronie klienta
- Obsługa dwóch etapów resetowania hasła:
  - Żądanie resetu (przez email)
  - Ustawienie nowego hasła (po kliknięciu w link)

#### 1.1.4 Strona potwierdzania adresu email (`/src/pages/auth/verify.astro`)
- Statyczna strona renderowana po stronie serwera
- Wyświetla status weryfikacji adresu email
- Obsługuje automatyczne przekierowanie do strony profilu po potwierdzeniu

### 1.2. Komponenty React client-side

#### 1.2.1 Komponent formularza logowania (`/src/components/auth/LoginForm.tsx`)
- Interaktywny formularz z polami email i hasło
- Walidacja danych wejściowych w czasie rzeczywistym
- Obsługa błędów autentykacji
- Przyciski "Zaloguj się" i "Zapomniałem hasła"
- Link do rejestracji dla nowych użytkowników

#### 1.2.2 Komponent formularza rejestracji (`/src/components/auth/RegisterForm.tsx`)
- Interaktywny formularz z polami: email, hasło, potwierdzenie hasła
- Walidacja danych wejściowych w czasie rzeczywistym
- Obsługa błędów rejestracji
- Przycisk "Zarejestruj się"
- Link do logowania dla istniejących użytkowników

#### 1.2.3 Komponent formularza resetowania hasła (`/src/components/auth/ResetPasswordForm.tsx`)
- Interaktywny formularz z dynamicznym widokiem zależnym od etapu:
  - Etap 1: Pole email i przycisk "Wyślij link resetujący"
  - Etap 2: Pola nowego hasła, potwierdzenia hasła i przycisk "Ustaw nowe hasło"
- Walidacja danych wejściowych w czasie rzeczywistym
- Obsługa błędów resetowania hasła

#### 1.2.4 Komponent przełącznika trybu ciemnego (`/src/components/ui/DarkModeToggle.tsx`)
- Przycisk przełączający motyw interfejsu
- Integracja z systemem motywów Tailwind

#### 1.2.5 Komponent przycisku wylogowania (`/src/components/auth/LogoutButton.tsx`)
- Przycisk wylogowania widoczny w nagłówku dla zalogowanych użytkowników
- Obsługa procesu wylogowania

### 1.3. Layouty

#### 1.3.1 Layout podstawowy (`/src/layouts/BaseLayout.astro`)
- Podstawowy layout zawierający wspólne elementy stron (head, meta, skrypty)
- Nie zawiera elementów nawigacyjnych ani stopki

#### 1.3.2 Layout autentykacji (`/src/layouts/AuthLayout.astro`)
- Dziedziczący po BaseLayout
- Specjalny layout dla stron autentykacji
- Zawiera logo, minimalistyczną nawigację i linki pomocnicze
- Centrowanie formularzy autentykacji
- Obsługa wyświetlania komunikatów o błędach i sukcesie

#### 1.3.3 Layout główny (`/src/layouts/MainLayout.astro`)
- Dziedziczący po BaseLayout
- Layout dla stron aplikacji po zalogowaniu
- Zawiera nagłówek z logo, nawigację główną, przycisk wylogowania i przełącznik trybu ciemnego
- Sprawdza status autentykacji i przekierowuje niezalogowanych użytkowników do strony logowania

### 1.4. Middleware autentykacji

#### 1.4.1 Middleware autentykacji (`/src/middleware/auth.ts`)
- Sprawdzanie sesji użytkownika
- Ochrona ścieżek wymagających autentykacji
- Przechowywanie i aktualizacja tokenu JWT
- Przekierowywanie niezalogowanych użytkowników do strony logowania

### 1.5. Walidacja i komunikaty błędów

#### 1.5.1 Walidacja formularzy
- Wykorzystanie biblioteki Zod do walidacji danych formularzy
- Obsługa standardowych błędów (pole wymagane, minimalnej długości, poprawności email itp.)
- Komunikaty błędów dostosowane do języka polskiego

#### 1.5.2 Komunikaty błędów autentykacji
- Invalid credentials - nieprawidłowy email lub hasło
- Email already in use - email już zarejestrowany w systemie
- Password too weak - zbyt słabe hasło (nie spełnia wymagań bezpieczeństwa)
- Email not verified - email nie został zweryfikowany
- Invalid reset token - nieprawidłowy token resetowania hasła

## 2. Logika backendowa

### 2.1. Endpointy API Astro

#### 2.1.1 Endpoint logowania (`/src/pages/api/auth/login.ts`)
- Metoda: POST
- Dane wejściowe: email, password
- Walidacja danych wejściowych za pomocą Zod
- Integracja z Supabase Auth signInWithPassword
- Obsługa sesji i przekierowań po pomyślnym logowaniu
- Zwracane statusy: 200 (sukces), 400 (nieprawidłowe dane), 401 (nieprawidłowe poświadczenia)

#### 2.1.2 Endpoint rejestracji (`/src/pages/api/auth/register.ts`)
- Metoda: POST
- Dane wejściowe: email, password, confirmPassword
- Walidacja danych wejściowych za pomocą Zod
- Integracja z Supabase Auth signUp
- Obsługa potwierdzenia adresu email
- Zwracane statusy: 201 (sukces), 400 (nieprawidłowe dane), 409 (email już istnieje)

#### 2.1.3 Endpoint resetowania hasła (`/src/pages/api/auth/reset-password.ts`)
- Metoda: POST
- Dwa tryby działania zależne od przesłanych danych:
  - Żądanie resetu (email)
  - Ustawienie nowego hasła (token, password, confirmPassword)
- Walidacja danych wejściowych za pomocą Zod
- Integracja z Supabase Auth resetPasswordForEmail i updateUser
- Zwracane statusy: 200 (sukces), 400 (nieprawidłowe dane), 404 (nie znaleziono użytkownika)

#### 2.1.4 Endpoint wylogowania (`/src/pages/api/auth/logout.ts`)
- Metoda: POST
- Integracja z Supabase Auth signOut
- Usunięcie sesji i ciasteczek
- Zwracane statusy: 200 (sukces), 401 (nie zalogowano)

#### 2.1.5 Endpoint weryfikacji email (`/src/pages/api/auth/verify.ts`)
- Metoda: GET
- Parametry zapytania: token
- Integracja z systemem weryfikacji email Supabase
- Obsługa przekierowań po pomyślnej weryfikacji
- Zwracane statusy: 200 (sukces), 400 (nieprawidłowy token)

### 2.2. Modele danych

#### 2.2.1 Model użytkownika
- Wykorzystanie wbudowanego modelu użytkownika Supabase Auth
- Dodatkowe pole w tabeli `profiles` połączone relacją 1:1 z tabelą `auth.users`
- Pola tabeli `profiles`:
  - id (klucz obcy do auth.users.id)
  - updated_at (data ostatniej aktualizacji)
  - created_at (data utworzenia)
  - diet_preferences (JSON z preferencjami żywieniowymi)

### 2.3. Walidacja danych wejściowych

#### 2.3.1 Schemat walidacji logowania (`/src/lib/validations/login.ts`)
- Email (wymagany, format email)
- Hasło (wymagane, minimum 8 znaków)

#### 2.3.2 Schemat walidacji rejestracji (`/src/lib/validations/register.ts`)
- Email (wymagany, format email)
- Hasło (wymagane, minimum 8 znaków, zawiera cyfrę i znak specjalny)
- Potwierdzenie hasła (wymagane, identyczne z hasłem)

#### 2.3.3 Schemat walidacji resetowania hasła (`/src/lib/validations/reset-password.ts`)
- Email (wymagany, format email) - dla etapu żądania resetowania
- Token (wymagany) - dla etapu ustawiania nowego hasła
- Hasło (wymagane, minimum 8 znaków, zawiera cyfrę i znak specjalny) - dla etapu ustawiania nowego hasła
- Potwierdzenie hasła (wymagane, identyczne z hasłem) - dla etapu ustawiania nowego hasła

### 2.4. Obsługa wyjątków

#### 2.4.1 Middleware obsługi błędów (`/src/middleware/error-handler.ts`)
- Centralne miejsce obsługi wyjątków
- Mapowanie błędów Supabase na odpowiednie komunikaty
- Logowanie błędów
- Standardowa struktura odpowiedzi błędów

#### 2.4.2 Klasa błędów aplikacji (`/src/lib/errors.ts`)
- Własna klasa błędów rozszerzająca Error
- Struktura zawierająca: kod błędu, wiadomość, szczegóły
- Metody pomocnicze do tworzenia standardowych błędów (np. nieautoryzowany, nieprawidłowe dane)

## 3. System autentykacji

### 3.1. Integracja z Supabase Auth

#### 3.1.1 Klient Supabase (`/src/db/supabase.ts`)
- Inicjalizacja klienta Supabase
- Konfiguracja opcji autentykacji
- Eksport funkcji pomocniczych do operacji autentykacji

#### 3.1.2 Serwis autentykacji (`/src/lib/services/auth-service.ts`)
- Abstrakcja nad klientem Supabase Auth
- Metody do logowania, rejestracji, wylogowania i resetowania hasła
- Obsługa sesji użytkownika
- Weryfikacja i odświeżanie tokenów JWT

### 3.2. Zarządzanie sesją

#### 3.2.1 Kontekst sesji Astro (`/src/lib/context/session.ts`)
- Integracja z eksperymentalnym API sesji Astro
- Przechowywanie danych sesji w ciasteczkach
- Metody do pobierania aktualnego użytkownika

#### 3.2.2 Obsługa tokenu JWT (`/src/lib/utils/jwt.ts`)
- Dekodowanie tokenu JWT
- Sprawdzanie ważności tokenu
- Odświeżanie tokenu po wygaśnięciu

### 3.3. Zabezpieczenie ścieżek

#### 3.3.1 Strażnik autentykacji (`/src/lib/guards/auth-guard.ts`)
- Funkcja sprawdzająca status autentykacji
- Używana w routerach Astro do zabezpieczenia stron wymagających logowania
- Przekierowywanie na stronę logowania z parametrem `redirectTo`

#### 3.3.2 Hook zarządzania autentykacją (`/src/hooks/useAuth.ts`)
- Główny hook integrujący React z Supabase Auth
- Metody:
  - `checkSession` - weryfikacja aktualnej sesji użytkownika z Supabase Auth
  - `login` - logowanie użytkownika poprzez Supabase Auth API
  - `register` - rejestracja nowego użytkownika poprzez Supabase Auth API
  - `logout` - wylogowanie użytkownika poprzez Supabase Auth API
- Obsługa błędów autentykacji z odpowiednimi komunikatami dla użytkownika
- Zarządzanie stanem ładowania podczas operacji autentykacji
- Komunikacja z API Supabase zamiast mockowanych danych

### 3.4. Przepływ użytkownika

#### 3.4.1 Rejestracja
1. Użytkownik wchodzi na stronę rejestracji
2. Wypełnia formularz (email, hasło, potwierdzenie hasła)
3. Po przesłaniu formularza, dane są walidowane
4. Supabase tworzy konto użytkownika
5. Użytkownik otrzymuje email z linkiem weryfikacyjnym
6. Po kliknięciu w link, email zostaje zweryfikowany
7. Użytkownik jest przekierowywany do strony logowania

#### 3.4.2 Logowanie
1. Użytkownik wchodzi na stronę logowania
2. Wypełnia formularz (email, hasło)
3. Po przesłaniu formularza, dane są walidowane
4. Supabase weryfikuje poświadczenia
5. Po pomyślnej weryfikacji, tworzona jest sesja
6. Użytkownik jest przekierowywany na stronę główną aplikacji

#### 3.4.3 Wylogowanie
1. Użytkownik klika przycisk wylogowania
2. Sesja jest usuwana
3. Użytkownik jest przekierowywany na stronę logowania

#### 3.4.4 Resetowanie hasła
1. Użytkownik wchodzi na stronę logowania i klika "Zapomniałem hasła"
2. Jest przekierowywany na stronę resetowania hasła
3. Podaje adres email
4. Otrzymuje link resetujący na email
5. Po kliknięciu w link, zostaje przekierowany do formularza ustawiania nowego hasła
6. Ustawia nowe hasło
7. Jest przekierowywany na stronę logowania

## 4. Komponenty interfejsu związane z autentykacją

### 4.1 Komponenty nawigacyjne

#### 4.1.1 Górna nawigacja (`/src/components/TopNav.astro`)
- Komponent renderowany po stronie serwera
- Wyświetla różne opcje w zależności od stanu autentykacji
- Zawiera przycisk wylogowania dla zalogowanych użytkowników
- Integracja z faktycznym API wylogowania Supabase
- Obsługa błędów podczas procesu wylogowania

### 4.2 Dialogi autentykacji

#### 4.2.1 Dialog autentykacji (`/src/components/AuthDialog.tsx`)
- Modalne okno dialogowe dla procesów logowania i rejestracji
- Dwa tryby pracy: logowanie i rejestracja
- Integracja z hookiem `useAuth` do komunikacji z Supabase Auth
- Walidacja formularzy po stronie klienta
- Obsługa błędów autentykacji z Supabase Auth
- Renderowanie odpowiednich komunikatów błędów
- Zarządzanie stanem ładowania podczas operacji autentykacji 