/**
 * Konfiguracja danych testowych z zmiennych środowiskowych
 * Używa pliku .env.test podczas uruchamiania z "npm run dev:e2e"
 */

// Sprawdź czy wszystkie wymagane zmienne środowiskowe są dostępne
const requiredEnvVars = ["E2E_USERNAME_ID", "E2E_USERNAME", "E2E_PASSWORD"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}. ` +
      `Make sure to run tests with "npm run dev:e2e" or set these variables in .env.test`
  );
}

export const testConfig = {
  // Dane logowania z .env.test
  credentials: {
    userId: process.env.E2E_USERNAME_ID || "",
    email: process.env.E2E_USERNAME || "",
    password: process.env.E2E_PASSWORD || "",
  },
} as const;

// Eksportuj typy dla TypeScript
export type TestCredentials = typeof testConfig.credentials;

// Funkcja pomocnicza
export const getTestCredentials = (): TestCredentials => testConfig.credentials;
