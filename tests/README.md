# Dokumentacja Testów - HealthyMeal

## Struktura Testów

Projekt zawiera kompletne środowisko testowe zgodnie z planem testów, obejmujące:

### 📁 Organizacja Katalogów

```
tests/
├── unit/          # Testy jednostkowe
├── e2e/           # Testy end-to-end (Playwright)
│   ├── config/    # Konfiguracja E2E
│   ├── page-objects/  # Page Object Models
│   ├── services/  # Cleanup service
│   └── recipe-management.spec.ts  # Główny test E2E
├── setup/         # Konfiguracja środowiska testowego
├── fixtures/      # Dane testowe
├── mocks/         # Mocki dla external services
└── README.md      # Ta dokumentacja
```

## 🛠 Dostępne Narzędzia Testowe

- **Jest** - Framework do testów jednostkowych i integracyjnych
- **React Testing Library** - Testowanie komponentów React
- **Playwright** - Testy end-to-end
- **Supertest** - Testowanie HTTP endpoints
- **@testing-library/jest-dom** - Dodatkowe matchers dla DOM

## 🚀 Komendy

### Testy Jednostkowe

```bash
# Uruchom wszystkie testy jednostkowe
npm run test

# Uruchom testy w trybie watch
npm run test:watch

# Generuj raport pokrycia kodu
npm run test:coverage
```

### Testy E2E

⚠️ **WYMAGANA KONFIGURACJA:** Przed uruchomieniem testów E2E należy skonfigurować plik `.env.test`

```bash
# Opcjonalnie uruchom ręcznie aplikację w trybie developerskim dla E2E
npm run dev:e2e

# Uruchom testy E2E
npm run test:e2e
```

### Wszystkie Testy

```bash
# Uruchom wszystkie typy testów
npm run test && npm run test:e2e
```

## ⚙️ Konfiguracja E2E

### Plik .env.test

Przed uruchomieniem testów E2E należy utworzyć plik `.env.test` w katalogu głównym projektu:

```bash
# Konfiguracja Supabase
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_anon_key_here

# Dane testowego użytkownika
E2E_USERNAME_ID=test_user_id
E2E_USERNAME=test@example.com
E2E_PASSWORD=test_password_123
```

**Uwagi:**

- Testowy użytkownik musi istnieć w bazie danych
- Dane logowania muszą być poprawne dla środowiska testowego

### Uruchomienie

1. **Przygotuj środowisko:**

   ```bash
   cp .env.test.example .env.test
   # Edytuj .env.test i wprowadź poprawne dane
   ```

2. **Opcjonalnie Ręcznie Uruchom aplikację:**

   ```bash
   npm run dev:e2e
   ```

3. **Uruchom testy:**
   ```bash
   npm run test:e2e
   ```

## 🎯 Typy Testów

### 1. Testy Jednostkowe (`tests/unit/`)

- Komponenty React
- Utility functions
- Business logic
- Validations

**Przykład uruchomienia:**

```bash
npm run test
```

### 2. Testy E2E (`tests/e2e/`)

- **Główny scenariusz:** Kompletny przepływ dodawania przepisu
- Integracja UI z backendem
- Walidacja krytycznej funkcjonalności

**Obecny zakres testów E2E:**

- ✅ Logowanie użytkownika
- ✅ Dodawanie nowego przepisu
- ✅ Walidacja formularza
- ✅ Sprawdzenie zapisania przepisu
- ✅ Usunięcie zapisanego przepisu

**Przykład uruchomienia:**

```bash
npm run test:e2e
```

## 📝 Scenariusze Testowe

### Aktywne Testy E2E

#### TC-E2E-001: Kompletny przepływ dodawania przepisu

**Kroki:**

1. Logowanie z danymi z `.env.test`
2. Kliknięcie "Dodaj przepis"
3. Wypełnienie formularza przepisu
4. Zapisanie przepisu
5. Sprawdzenie czy przepis pojawił się na liście

**Status:** ✅ Zaimplementowany w `recipe-management.spec.ts`

## 🔧 Konfiguracja

### Jest (jest.config.js)

- Konfiguracja TypeScript
- React/JSX support
- Module path mapping
- Coverage settings
- Test environment setup

### Playwright (playwright.config.ts)

- Multi-browser testing
- Mobile device simulation
- Screenshots on failure
- Video recording
- Parallel execution

### ESLint

- Automatyczne wykrywanie testów
- Jest globals
- Testing Library rules

## 📦 Mocki i Fixtures

### Supabase Mock (`tests/mocks/supabase.mock.ts`)

```typescript
import { mockSupabaseClient, createMockSuccessResponse } from "@tests/mocks/supabase.mock";

// Example usage
mockSupabaseClient.from.mockResolvedValue(createMockSuccessResponse(mockRecipes));
```

### Test Fixtures (`tests/fixtures/`)

```typescript
import { mockRecipes, createMockRecipe } from "@tests/fixtures/recipes";

// Use predefined data
const recipe = mockRecipes[0];

// Create custom test data
const customRecipe = createMockRecipe({ title: "Custom Recipe" });
```

## 🐛 Debugowanie Testów

### Jest

```bash
# Debug konkretnego testu
npm run test -- --testNamePattern="nazwa testu" --verbose

# Run single test file
npm run test -- tests/unit/specific.test.ts
```

### Playwright

```bash
# Debug mode z DevTools
npm run test:e2e:debug

# Headed mode (widoczna przeglądarka)
npm run test:e2e:headed

# Record new test
npx playwright codegen localhost:4321
```

### Troubleshooting E2E

**Problem:** Test nie może się połączyć z aplikacją

```bash
# Spróbuj ręcznie uruchomić aplikację przed testem
npm run dev:e2e

# Sprawdź port w playwright.config.ts
```

**Problem:** Błędy autoryzacji

```bash
# Sprawdź dane w .env.test
# Zweryfikuj czy testowy użytkownik istnieje w bazie
# Sprawdź poprawność URL i kluczy Supabase
```

## 📊 Raportowanie

### Coverage Reports

- HTML: `coverage/lcov-report/index.html`
- JSON: `coverage/coverage-final.json`
- Text: Wyświetlany w terminalu

### E2E Reports

- HTML: `playwright-report/index.html`
- JSON: `test-results/e2e-results.json`

## 🔄 CI/CD Integration

Testy są skonfigurowane do automatycznego uruchamiania w:

- GitHub Actions
- Pre-commit hooks (Husky)
- Pull Request validation

### Przydatne Linki

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Plan Testów](../.ai/test-plan.md)
