# Dokument wymagań produktu (PRD) - HealthyMeal

## 1. Przegląd produktu

HealthyMeal to aplikacja wykorzystująca sztuczną inteligencję do personalizacji przepisów kulinarnych na podstawie indywidualnych preferencji żywieniowych użytkowników.
MVP aplikacji skupia się na podstawowych funkcjonalnościach umożliwiających użytkownikom zarządzanie przepisami w formie tekstowej oraz dostosowywanie ich do osobistych potrzeb żywieniowych przy pomocy AI.

Aplikacja pozwala użytkownikom na:

- Tworzenie i zarządzanie kontem użytkownika
- Definiowanie preferencji żywieniowych w profilu
- Zapisywanie, przeglądanie, edytowanie i usuwanie przepisów
- Generowanie nowych przepisów z pomocą AI
- Modyfikowanie istniejących przepisów z pomocą AI przy uwzględnieniu preferencji użytkownika

## 2. Problem użytkownika

Głównym problemem, który rozwiązuje HealthyMeal, jest trudność w dostosowywaniu dostępnych w sieci przepisów kulinarnych do indywidualnych potrzeb i wymagań żywieniowych użytkowników.

Typowe wyzwania użytkowników:

- Czasochłonne ręczne modyfikowanie znalezionych przepisów
- Brak wiedzy jak zastąpić składniki nieodpowiadające preferencjom lub ograniczeniom dietetycznym
- Trudność w znalezieniu przepisów uwzględniających konkretne preferencje żywieniowe
- Konieczność przeszukiwania wielu źródeł w poszukiwaniu odpowiednich przepisów

HealthyMeal rozwiązuje te problemy poprzez wykorzystanie AI do personalizacji przepisów zgodnie z preferencjami użytkownika zapisanymi w profilu.

## 3. Wymagania funkcjonalne

### 3.1 Zarządzanie kontem użytkownika

- Rejestracja i logowanie użytkowników przy użyciu domyślnych ekranów Supabase Auth
- Możliwość wylogowania z aplikacji w dowolnym momencie

### 3.2 Profil użytkownika

- Definiowanie preferencji żywieniowych (produkty lubiane, nielubiane, wykluczone i diety)
- Możliwość dodawania, edytowania i usuwania preferencji żywieniowych (do 50 różnych preferencji)
- Każda preferencja może zawierać maksymalnie 50 znaków
- Profil uznawany za ukończony po zapisaniu minimum 3 preferencji (ale są one opcjonalne i można mieć mniej)

### 3.3 Zarządzanie przepisami

- Dodawanie nowych przepisów w formie tekstowej
- Przeglądanie listy zapisanych przepisów
- Edycja istniejących przepisów
- Usuwanie niepotrzebnych przepisów
- Brak ograniczeń co do liczby przepisów zapisanych przez użytkownika

### 3.4 Integracja z AI

- Generowanie nowych przepisów na podstawie preferencji użytkownika
- Modyfikowanie istniejących przepisów zgodnie z preferencjami
- Maksymalna długość pola z treścią przepisu (content): 5000 znaków
- Maksymalna długość pola z dodatkowymi parametrami (additional_params): 5000 znaków
- Ręczne wywołanie modyfikacji przez przycisk "Generuj"
- Możliwość zapisania zmodyfikowanego przepisu jako nowego lub nadpisania istniejącego
- Decyzja o akceptacji lub odrzuceniu przepisu należy wyłącznie do użytkownika

### 3.5 System logowania

- Rejestrowanie akcji użytkownika w systemie logów
- Zbierane dane: user_id, action_type, date, informacja o akceptacji zmian proponowanych przez AI, actual_ai_model, generate_response_time
- Zarządzanie logami poprzez bazę danych

## 4. Granice produktu

### 4.1 Co nie wchodzi w zakres MVP:

- Import przepisów z adresu URL
- Obsługa multimediów (np. zdjęć przepisów)
- Udostępnianie przepisów innym użytkownikom
- Funkcje społecznościowe (komentarze, oceny, itp.)
- Mechanizm zbierania feedbacku od użytkowników
- Zaawansowane narzędzia administracyjne do zarządzania logami

### 4.2 Ograniczenia techniczne:

- Maksymalna długość pola content: 5000 znaków
- Maksymalna długość pola additional_params: 5000 znaków
- Maksymalna liczba preferencji żywieniowych: 50
- Maksymalna długość pojedynczej preferencji: 50 znaków

### 4.3 Wymagania niefunkcjonalne:

- Formatowanie kodu: Prettier + ESLint, camelCase w strukturze plików
- Klucze przechowywane w .env, nie w repozytorium
- Jeden kluczowy unit test, z możliwością rozbudowy w przyszłości
- Proste komentarze w kodzie

## 5. Historyjki użytkowników

### US-001: Rejestracja użytkownika

- Tytuł: Rejestracja nowego użytkownika
- Opis: Jako nowy użytkownik, chcę utworzyć konto w aplikacji HealthyMeal, abym mógł korzystać z jej funkcjonalności.
- Kryteria akceptacji:
  1. Użytkownik może wejść na stronę rejestracji
  2. Użytkownik może wprowadzić swój email i hasło
  3. System weryfikuje poprawność danych
  4. Po poprawnej rejestracji, użytkownik jest przekierowywany do strony głównej aplikacji

### US-002: Logowanie użytkownika

- Tytuł: Logowanie do aplikacji
- Opis: Jako zarejestrowany użytkownik, chcę zalogować się do aplikacji, aby uzyskać dostęp do moich danych i przepisów.
- Kryteria akceptacji:
  1. Użytkownik może wejść na stronę logowania
  2. Użytkownik może wprowadzić swój email i hasło
  3. System weryfikuje poprawność danych
  4. Po poprawnym logowaniu, użytkownik jest przekierowywany do strony głównej aplikacji
  5. System zapewnia, że użytkownik ma dostęp tylko do swoich danych

### US-003: Wylogowanie z aplikacji

- Tytuł: Wylogowanie z aplikacji
- Opis: Jako zalogowany użytkownik, chcę wylogować się z aplikacji.
- Kryteria akceptacji:
  1. Zalogowany użytkownik widzi przycisk "Wyloguj" w interfejsie
  2. Po kliknięciu przycisku "Wyloguj", sesja użytkownika jest zakończona
  3. Użytkownik jest przekierowywany do strony logowania

### US-004: Uzupełnienie profilu preferencji żywieniowych

- Tytuł: Uzupełnienie profilu preferencji żywieniowych
- Opis: Jako zalogowany użytkownik, chcę uzupełnić moje preferencje żywieniowe w profilu, aby system mógł dostosować przepisy do moich potrzeb.
- Kryteria akceptacji:
  1. Użytkownik ma dostęp do strony profilu
  2. Użytkownik może dodać preferencje w kategoriach: lubiane, nielubiane, wykluczone, diety
  3. System umożliwia dodanie do 50 preferencji
  4. Każda preferencja może zawierać maksymalnie 50 znaków
  5. System zapisuje wprowadzone preferencje w profilu użytkownika

### US-005: Edycja, profilu preferencji żywieniowych

- Tytuł: Edycja preferencji żywieniowych
- Opis: Jako zalogowany użytkownik, chcę edytować moje zapisane preferencje żywieniowe.
- Kryteria akceptacji:
  1. Użytkownik widzi listę swoich zapisanych preferencji
  2. Użytkownik może wybrać preferencję do edycji
  3. System umożliwia zmianę treści preferencji
  4. System zapisuje zaktualizowaną preferencję

### US-006: Usuwanie preferencji żywieniowych

- Tytuł: Usuwanie preferencji żywieniowych
- Opis: Jako zalogowany użytkownik, chcę usunąć wybrane preferencje żywieniowe, które nie są już dla mnie istotne.
- Kryteria akceptacji:
  1. Użytkownik widzi listę swoich zapisanych preferencji
  2. Użytkownik może wybrać preferencję do usunięcia
  3. System prosi o potwierdzenie przed usunięciem
  4. Po potwierdzeniu, system usuwa wybraną preferencję

### US-007: Dodawanie nowego przepisu

- Tytuł: Dodawanie nowego przepisu
- Opis: Jako zalogowany użytkownik, chcę dodać nowy przepis do mojej kolekcji, abym mógł go zapisać i w przyszłości zmodyfikować.
- Kryteria akceptacji:
  1. Użytkownik ma dostęp do formularza dodawania przepisu
  2. Użytkownik może wprowadzić treść przepisu (max 5000 znaków)
  3. Po zapisaniu, przepis jest dodawany do kolekcji użytkownika

### US-008: Przeglądanie listy przepisów

- Tytuł: Przeglądanie listy przepisów
- Opis: Jako zalogowany użytkownik, chcę przeglądać listę moich zapisanych przepisów, aby łatwo znaleźć interesujący mnie przepis.
- Kryteria akceptacji:
  1. Użytkownik widzi listę swoich zapisanych przepisów
  2. Lista pokazuje podstawowe informacje o przepisach i opcje edycji lub usunięcia przepisu
  3. Użytkownik może scrollować listę, jeśli jest długa

### US-009: Wyświetlanie szczegółów przepisu

- Tytuł: Wyświetlanie szczegółów przepisu
- Opis: Jako zalogowany użytkownik, chcę zobaczyć pełną treść wybranego przepisu, aby zapoznać się z jego zawartością.
- Kryteria akceptacji:
  1. Użytkownik może wybrać przepis z listy
  2. System wyświetla pełną treść wybranego przepisu

### US-010: Edycja istniejącego przepisu

- Tytuł: Edycja istniejącego przepisu
- Opis: Jako zalogowany użytkownik, chcę edytować zapisany przepis, aby wprowadzić w nim zmiany.
- Kryteria akceptacji:
  1. Użytkownik może wybrać przepis do edycji
  2. System wyświetla formularz z aktualną treścią przepisu
  3. Użytkownik może zmienić treść przepisu
  4. System waliduje wprowadzone zmiany
  5. Po zapisaniu, przepis jest aktualizowany w kolekcji użytkownika

### US-011: Usuwanie przepisu

- Tytuł: Usuwanie przepisu
- Opis: Jako zalogowany użytkownik, chcę usunąć niepotrzebny przepis z mojej kolekcji, aby utrzymać porządek.
- Kryteria akceptacji:
  1. Użytkownik może wybrać przepis do usunięcia
  2. System prosi o potwierdzenie przed usunięciem
  3. Po potwierdzeniu, system usuwa wybrany przepis

### US-012: Generowanie nowego przepisu przez AI

- Tytuł: Generowanie nowego przepisu przez AI
- Opis: Jako zalogowany użytkownik, chcę wygenerować nowy przepis przy pomocy AI, który będzie dostosowany do moich preferencji żywieniowych.
- Kryteria akceptacji:
  1. Użytkownik ma dostęp do opcji generowania nowego przepisu
  2. Użytkownik może wprowadzić dodatkowe parametry (max 5000 znaków)
  3. System wykorzystuje AI do wygenerowania przepisu uwzględniającego preferencje użytkownika
  4. Użytkownik może zaakceptować lub odrzucić wygenerowany przepis
  5. Po akceptacji, przepis jest zapisywany w kolekcji użytkownika

### US-013: Modyfikacja istniejącego przepisu przez AI

- Tytuł: Modyfikacja istniejącego przepisu przez AI
- Opis: Jako zalogowany użytkownik, chcę zmodyfikować istniejący przepis przy pomocy AI, aby dostosować go do moich preferencji żywieniowych.
- Kryteria akceptacji:
  1. Użytkownik może wybrać przepis do modyfikacji
  2. Użytkownik może wprowadzić dodatkowe parametry modyfikacji (max 5000 znaków)
  3. System wykorzystuje AI do modyfikacji przepisu uwzględniając preferencje użytkownika
  4. Użytkownik może zaakceptować lub odrzucić zmodyfikowany przepis
  5. Użytkownik może zdecydować czy zapisać modyfikację jako nowy przepis czy nadpisać istniejący

## 6. Metryki sukcesu

### 6.1 Wskaźniki kluczowe:

- 90% zarejestrowanych użytkowników posiada minimum 3 preferencje wypełnione w profilu
- 75% aktywnych użytkowników generuje co najmniej jeden przepis w tygodniu

### 6.2 Metody pomiaru:

- Procent użytkowników z wypełnionym profilem: obliczany przez zapytanie do bazy danych zliczające użytkowników z minimum 3 zapisanymi preferencjami w stosunku do wszystkich zarejestrowanych użytkowników
- Aktywność generowania przepisów: monitorowanie liczby unikalnych user_id z akcją "generate" w ciągu ostatnich 7 dni, na podstawie tabeli logów

### 6.3 System monitorowania:

- Zbieranie logów zawierających: user_id, action_type, date, (informacja czy zaakceptowano zmiany proponowane przez AI) is_accepted, actual_ai_model, (czasu generowania odpowiedzi przez AI) generate_response_time
