# Dokumentacja Testów - HealthyMeal

## Struktura Testów

Projekt zawiera kompletne środowisko testowe zgodnie z planem testów, obejmujące:

### 📁 Organizacja Katalogów

```
tests/
├── unit/           # Testy jednostkowe (Jest + React Testing Library)
├── integration/    # Testy integracyjne (Jest + Supertest)
├── e2e/           # Testy end-to-end (Playwright)
├── setup/         # Konfiguracja środowiska testowego
├── fixtures/      # Dane testowe
├── mocks/         # Mocki dla external services
└── README.md      # Ta dokumentacja
```

## 🛠 Narzędzia Testowe

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
```bash
# Uruchom testy E2E
npm run test:e2e

# Uruchom testy E2E z interfejsem
npm run test:e2e:ui

# Uruchom testy E2E w trybie headed
npm run test:e2e:headed

# Debug testów E2E
npm run test:e2e:debug
```

### Wszystkie Testy
```bash
# Uruchom wszystkie typy testów
npm run test && npm run test:e2e
```

## 📊 Kryteria Pokrycia

Zgodnie z planem testów:
- **Minimum 80%** pokrycia dla krytycznych modułów
- **100%** testów krytycznych musi przechodzić
- **95%** testów wysokiego priorytetu musi przechodzić

## 🎯 Typy Testów

### 1. Testy Jednostkowe (`tests/unit/`)
- Komponenty React
- Utility functions
- Business logic
- Validations

**Przykład uruchomienia:**
```bash
npm run test -- --testPathPattern=unit
```

### 2. Testy Integracyjne (`tests/integration/`)
- API endpoints
- Komunikacja z bazą danych
- Integracja z Supabase
- Services integration

**Przykład uruchomienia:**
```bash
npm run test -- --testPathPattern=integration
```

### 3. Testy E2E (`tests/e2e/`)
- Kompletne przepływy użytkownika
- Integracja UI z backendem
- Cross-browser testing
- User journey validation

**Przykład uruchomienia:**
```bash
npm run test:e2e -- --headed
```

## 📝 Scenariusze Testowe

### Autentykacja
- TC-AUTH-001: Rejestracja nowego użytkownika
- TC-AUTH-002: Logowanie z poprawnymi danymi  
- TC-AUTH-003: Wylogowanie

### Zarządzanie Preferencjami
- TC-PREF-001: Dodawanie preferencji żywieniowej
- TC-PREF-002: Edycja preferencji
- TC-PREF-003: Limit 50 preferencji

### Zarządzanie Przepisami
- TC-RECIPE-001: Dodawanie nowego przepisu
- TC-RECIPE-002: Wyświetlanie listy przepisów
- TC-RECIPE-003: Wyszukiwanie przepisów
- TC-RECIPE-004: Edycja przepisu
- TC-RECIPE-005: Usuwanie przepisu

### Integracja z AI
- TC-AI-001: Generowanie nowego przepisu
- TC-AI-002: Modyfikacja istniejącego przepisu przez AI
- TC-AI-003: Zapisywanie wygenerowanego przepisu
- TC-AI-004: Odrzucenie wygenerowanego przepisu

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
import { mockSupabaseClient, createMockSuccessResponse } from '@tests/mocks/supabase.mock';

// Example usage
mockSupabaseClient.from.mockResolvedValue(
  createMockSuccessResponse(mockRecipes)
);
```

### Test Fixtures (`tests/fixtures/`)
```typescript
import { mockRecipes, createMockRecipe } from '@tests/fixtures/recipes';

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

# Headed mode (widoczna przeglądarką)
npm run test:e2e:headed

# Record new test
npx playwright codegen localhost:4321
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

## 💡 Best Practices

1. **Naming Convention:**
   - Unit tests: `*.test.ts`
   - E2E tests: `*.spec.ts`

2. **Test Data:**
   - Używaj fixtures dla consistent data
   - Resetuj mocki między testami
   - Isolate test data per test

3. **Assertions:**
   - Test behavior, not implementation
   - Use semantic selectors (roles, labels)
   - Test accessibility

4. **Performance:**
   - Parallel execution where possible
   - Skip tests in development: `test.skip()`
   - Focus on changed code: `test.only()`

## 🆘 Troubleshooting

### Common Issues

**Jest nie znajduje modułów:**
```bash
# Sprawdź konfigurację path mappings w jest.config.js
```

**Playwright testy timeout:**
```bash
# Zwiększ timeout w playwright.config.ts
# Sprawdź czy aplikacja działa na porcie 4321
```

**React Testing Library errors:**
```bash
# Sprawdź czy jest setup w tests/setup/jest.setup.ts
# Zweryfikuj import '@testing-library/jest-dom'
```

### Przydatne Linki
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Plan Testów](../.ai/test-plan.md) 