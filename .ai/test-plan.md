# Plan Testów dla Aplikacji HealthyMeal

## 1. Wprowadzenie i cele testowania

### Cel główny
Zapewnienie wysokiej jakości aplikacji HealthyMeal - platformy wykorzystującej sztuczną inteligencję do personalizacji przepisów kulinarnych na podstawie indywidualnych preferencji żywieniowych użytkowników.

### Cele szczegółowe
- Weryfikacja poprawności funkcjonalności CRUD dla przepisów i preferencji
- Walidacja integracji z zewnętrznymi API (OpenRouter.ai, Supabase)
- Sprawdzenie bezpieczeństwa autoryzacji i autentykacji użytkowników
- Testowanie responsywności interfejsu użytkownika
- Weryfikacja wydajności generowania przepisów przez AI
- Zapewnienie dostępności aplikacji zgodnie ze standardami WCAG

## 2. Zakres testów

### Moduły objęte testowaniem:
- **System autentykacji**: rejestracja, logowanie, wylogowanie, reset hasła
- **Zarządzanie preferencjami**: CRUD preferencji żywieniowych
- **Zarządzanie przepisami**: CRUD przepisów, wyszukiwanie, sortowanie
- **Integracja AI**: generowanie i modyfikacja przepisów przez OpenRouter
- **Interfejs użytkownika**: komponenty React, responsywność, UX
- **API endpoints**: wszystkie endpointy backendu
- **Bezpieczeństwo**: autoryzacja, walidacja danych, RLS
- **Baza danych**: migracje, integralność danych

### Moduły wyłączone z testowania:
- Infrastruktura zewnętrzna (Supabase Cloud, DigitalOcean)
- Narzędzia deweloperskie (ESLint, Prettier)
- Konfiguracja CI/CD (GitHub Actions)

## 3. Typy testów do przeprowadzenia

### 3.1 Testy jednostkowe (Unit Tests)
- **Zakres**: Komponenty React, utility functions, validations, services
- **Narzędzia**: Jest, React Testing Library
- **Priorytet**: Wysoki
- **Pokrycie**: minimum 80% dla krytycznych funkcji

### 3.2 Testy integracyjne (Integration Tests)
- **Zakres**: API endpoints, komunikacja z bazą danych, integracja z Supabase
- **Narzędzia**: Jest, Supertest
- **Priorytet**: Wysoki
- **Pokrycie**: wszystkie API endpoints

### 3.3 Testy end-to-end (E2E Tests)
- **Zakres**: Kompletne przepływy użytkownika, integracja z UI
- **Narzędzia**: Playwright
- **Priorytet**: Średni
- **Pokrycie**: kluczowe user stories

### 3.4 Testy wydajnościowe (Performance Tests)
- **Zakres**: Czas odpowiedzi API, generowanie przez AI, ładowanie stron
- **Narzędzia**: Lighthouse, k6
- **Priorytet**: Średni

### 3.5 Testy bezpieczeństwa (Security Tests)
- **Zakres**: Autoryzacja, injection attacks, XSS, CSRF
- **Narzędzia**: OWASP ZAP, ręczne testy
- **Priorytet**: Wysoki

### 3.6 Testy dostępności (Accessibility Tests)
- **Zakres**: Zgodność z WCAG 2.1 AA
- **Narzędzia**: axe-core, ręczne testy
- **Priorytet**: Średni

## 4. Scenariusze testowe dla kluczowych funkcjonalności

### 4.1 Autentykacja użytkowników
**TC-AUTH-001: Rejestracja nowego użytkownika**
- Krok 1: Otwórz stronę rejestracji
- Krok 2: Wprowadź poprawny email i hasło
- Krok 3: Kliknij "Zarejestruj"
- Oczekiwany rezultat: Użytkownik zostaje zarejestrowany i przekierowany na stronę główną

**TC-AUTH-002: Logowanie z poprawnymi danymi**
- Krok 1: Otwórz stronę logowania
- Krok 2: Wprowadź poprawny email i hasło
- Krok 3: Kliknij "Zaloguj"
- Oczekiwany rezultat: Użytkownik zostaje zalogowany

**TC-AUTH-003: Wylogowanie**
- Warunek wstępny: Użytkownik jest zalogowany
- Krok 1: Kliknij przycisk "Wyloguj"
- Oczekiwany rezultat: Sesja zostaje zakończona, przekierowanie na stronę logowania

### 4.2 Zarządzanie preferencjami
**TC-PREF-001: Dodawanie preferencji żywieniowej**
- Warunek wstępny: Użytkownik jest zalogowany
- Krok 1: Przejdź do profilu użytkownika
- Krok 2: Dodaj preferencję (np. "lubiane: awokado")
- Krok 3: Zapisz preferencję
- Oczekiwany rezultat: Preferencja zostaje dodana do profilu

**TC-PREF-002: Edycja preferencji**
- Warunek wstępny: Użytkownik ma zapisane preferencje
- Krok 1: Kliknij edycję preferencji
- Krok 2: Zmień wartość preferencji
- Krok 3: Zapisz zmiany
- Oczekiwany rezultat: Preferencja zostaje zaktualizowana

**TC-PREF-003: Limit 50 preferencji**
- Warunek wstępny: Użytkownik ma 49 preferencji
- Krok 1: Próbuj dodać kolejne preferencje
- Oczekiwany rezultat: Po dodaniu 50. preferencji, system blokuje dodawanie kolejnych

### 4.3 Zarządzanie przepisami
**TC-RECIPE-001: Dodawanie nowego przepisu**
- Warunek wstępny: Użytkownik jest zalogowany
- Krok 1: Kliknij "Dodaj przepis"
- Krok 2: Wprowadź tytuł i treść przepisu
- Krok 3: Zapisz przepis
- Oczekiwany rezultat: Przepis zostaje dodany do kolekcji

**TC-RECIPE-002: Wyświetlanie listy przepisów**
- Warunek wstępny: Użytkownik ma zapisane przepisy
- Krok 1: Przejdź na stronę główną
- Oczekiwany rezultat: Lista przepisów zostaje wyświetlona

**TC-RECIPE-003: Wyszukiwanie przepisów**
- Warunek wstępny: Użytkownik ma zapisane przepisy
- Krok 1: Wprowadź frazę w pole wyszukiwania
- Oczekiwany rezultat: Lista zostaje przefiltrowana zgodnie z frazą

**TC-RECIPE-004: Edycja przepisu**
- Warunek wstępny: Przepis istnieje
- Krok 1: Kliknij "Edytuj" przy przepisie
- Krok 2: Zmień treść przepisu
- Krok 3: Zapisz zmiany
- Oczekiwany rezultat: Przepis zostaje zaktualizowany

**TC-RECIPE-005: Usuwanie przepisu**
- Warunek wstępny: Przepis istnieje
- Krok 1: Kliknij "Usuń" przy przepisie
- Krok 2: Potwierdź usunięcie
- Oczekiwany rezultat: Przepis zostaje usunięty

### 4.4 Integracja z AI
**TC-AI-001: Generowanie nowego przepisu**
- Warunek wstępny: Użytkownik ma preferencje
- Krok 1: Kliknij "Generuj przepis z AI"
- Krok 2: Wprowadź dodatkowe parametry (opcjonalne)
- Krok 3: Kliknij "Generuj"
- Oczekiwany rezultat: AI generuje przepis uwzględniający preferencje

**TC-AI-002: Modyfikacja istniejącego przepisu przez AI**
- Warunek wstępny: Przepis istnieje, użytkownik ma preferencje
- Krok 1: Kliknij "Modyfikuj z AI" przy przepisie
- Krok 2: Wprowadź instrukcje modyfikacji
- Krok 3: Kliknij "Modyfikuj"
- Oczekiwany rezultat: AI modyfikuje przepis zgodnie z preferencjami

**TC-AI-003: Zapisywanie wygenerowanego przepisu**
- Warunek wstępny: AI wygenerował przepis
- Krok 1: Przejrzyj wygenerowany przepis
- Krok 2: Kliknij "Zapisz jako nowy" lub "Zastąp istniejący"
- Oczekiwany rezultat: Przepis zostaje zapisany zgodnie z wyborem

**TC-AI-004: Odrzucenie wygenerowanego przepisu**
- Warunek wstępny: AI wygenerował przepis
- Krok 1: Przejrzyj wygenerowany przepis
- Krok 2: Kliknij "Odrzuć"
- Oczekiwany rezultat: Przepis nie zostaje zapisany

## 5. Środowisko testowe

### 5.1 Środowiska
- **Development**: Lokalne środowisko deweloperów
- **Staging**: Środowisko pre-produkcyjne z pełną konfiguracją
- **Production**: Środowisko produkcyjne (tylko testy smoke)

### 5.2 Konfiguracja testowa
- **Backend**: Supabase z testową bazą danych
- **AI Service**: OpenRouter.ai z limitowanymi kluczami API
- **Frontend**: Astro 5 + React 19 w trybie development/production
- **Browsers**: Chrome 120+, Firefox 115+

### 5.3 Dane testowe
- Użytkownicy testowi z różnymi profilami preferencji
- Zestaw przepisów testowych
- Mockowane odpowiedzi API dla AI service
- Dane testowe dla różnych scenariuszy błędów

## 6. Narzędzia do testowania

### 6.1 Automatyzacja testów
- **Unit/Integration**: Jest + React Testing Library
- **E2E**: Playwright
- **API**: Supertest + Jest
- **Performance**: Lighthouse CI, k6
- **Security**: OWASP ZAP, npm audit

### 6.2 Narzędzia wspomagające
- **CI/CD**: GitHub Actions
- **Test Management**: TestRail lub podobne
- **Bug Tracking**: GitHub Issues
- **Code Coverage**: Jest Coverage, Codecov
- **Accessibility**: axe-core, Pa11y

### 6.3 Monitoring i raportowanie
- **Test Reports**: Jest HTML Reporter, Allure
- **Performance Monitoring**: Sentry, LogRocket
- **Error Tracking**: Sentry

## 7. Harmonogram testów

### Faza 1: Przygotowanie
- Konfiguracja środowisk testowych
- Przygotowanie danych testowych
- Setup narzędzi automatyzacji

### Faza 2: Testy jednostkowe
- Implementacja testów dla services i utilities
- Testy komponentów React
- Code coverage minimum 80%

### Faza 3: Testy integracyjne
- Testy API endpoints
- Integracja z Supabase
- Testy komunikacji z OpenRouter.ai

### Faza 4: Testy systemowe
- Testy E2E kluczowych przepływów
- Testy wydajnościowe
- Testy bezpieczeństwa

### Faza 5: Testy akceptacyjne
- Walidacja wszystkich user stories
- Testy dostępności
- Final smoke tests

### Faza 6: Testy regresyjne
- Automatyczne testy po każdym deploymencie
- Monitoring produkcyjny
- Testy smoke w środowisku produkcyjnym

## 8. Kryteria akceptacji testów

### 8.1 Kryteria wyjścia (Exit Criteria)
- 100% krytycznych testów przechodzi pomyślnie
- 95% testów wysokiego priorytetu przechodzi pomyślnie
- 90% wszystkich testów automatycznych przechodzi pomyślnie
- Code coverage minimum 80% dla krytycznych modułów
- Brak krytycznych i wysokich błędów bezpieczeństwa
- Performance: czas ładowania strony < 3s, API response time < 2s

### 8.2 Kryteria jakości
- Zgodność z wymaganiami z PRD
- Wszystkie user stories zaimplementowane i przetestowane
- UI/UX zgodne z design system
- Dostępność na poziomie WCAG 2.1 AA
- Kompatybilność z wspieranymi przeglądarkami

### 8.3 Metryki sukcesu
- Defect Density < 2 defekty/KLOC
- Test Execution Rate > 95%
- Test Automation Rate > 80% dla testów regresyjnych
- Mean Time To Recovery (MTTR) < 4 godziny

## 9. Procedury raportowania błędów

### 9.1 Klasyfikacja błędów
**Krytyczne (P1)**
- Aplikacja nie uruchamia się
- Utrata danych użytkownika
- Naruszenia bezpieczeństwa
- SLA: Naprawa w ciągu 4 godzin

**Wysokie (P2)**
- Funkcjonalność nie działa zgodnie z wymaganiami
- Błędy w kluczowych przepływach
- Performance issues
- SLA: Naprawa w ciągu 1 dnia roboczego

**Średnie (P3)**
- Drobne błędy funkcjonalności
- UI/UX issues
- Błędy walidacji
- SLA: Naprawa w ciągu 3 dni roboczych

**Niskie (P4)**
- Błędy kosmetyczne
- Drobne usprawnienia
- Documentation issues
- SLA: Naprawa w następnym sprincie

### 9.2 Szablon zgłoszenia błędu
```
**Tytuł**: [Krótki opis błędu]

**Priorytet**: [P1/P2/P3/P4]

**Środowisko**: [Dev/Staging/Production]

**Kroki do reprodukcji**:
1. [Krok 1]
2. [Krok 2]
3. [Krok 3]

**Oczekiwany rezultat**: [Co powinno się stać]

**Faktyczny rezultat**: [Co się stało]

**Załączniki**: [Screenshots, logi, video]

**Dane testowe**: [User accounts, test data used]

**Browser/Device**: [Chrome 120, iPhone 14, etc.]
```