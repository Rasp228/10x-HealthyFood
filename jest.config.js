/** @type {import('jest').Config} */
export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",

  // Roots dla skanowania testów
  roots: ["<rootDir>/src", "<rootDir>/tests"],

  // Wzorce plików testowych
  testMatch: [
    "<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}",
    "<rootDir>/src/**/*.(test|spec).{js,jsx,ts,tsx}",
    "<rootDir>/tests/unit/**/*.(test|spec).{js,jsx,ts,tsx}",
    "<rootDir>/tests/integration/**/*.(test|spec).{js,jsx,ts,tsx}",
  ],

  // Setup files
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.ts"],

  // Module name mapping (dla import paths)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@components/(.*)$": "<rootDir>/src/components/$1",
    "^@lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@db/(.*)$": "<rootDir>/src/db/$1",
    "^@types$": "<rootDir>/src/types.ts",
    // Mockowanie statycznych plików
    "\\.(css|less|scss|sass)$": "jest-transform-stub",
    "\\.(gif|ttf|eot|svg|png|jpg|jpeg)$": "jest-transform-stub",
  },

  // Transform configuration
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.test.json",
      },
    ],
    "^.+\\.(js|jsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "tsconfig.test.json",
      },
    ],
  },

  // ESM support
  extensionsToTreatAsEsm: [".ts", ".tsx"],

  // Zbieranie coverage
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.astro",
    "!src/env.d.ts",
    "!src/middleware/**/*",
    "!src/pages/**/*",
    "!src/layouts/**/*",
  ],

  // Progi pokrycia zgodnie z planem testów (minimum 80%)
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Katalogi do ignorowania
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/dist/", "<rootDir>/tests/e2e/"],

  // Transformacje modułów
  transformIgnorePatterns: ["node_modules/(?!(.*\\.mjs$|@astrojs/.*|astro/.*))"],

  // Timeout dla testów
  testTimeout: 10000,

  // Verbose output
  verbose: true,
};
