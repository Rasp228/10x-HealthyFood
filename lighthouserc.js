/* eslint-env node */
module.exports = {
  ci: {
    collect: {
      // Uruchom lokalny serwer do testów
      startServerCommand: "npm run preview",
      startServerReadyPattern: "Local:.*:4321",
      startServerReadyTimeout: 30000,
      url: [
        "http://localhost:4321",
        "http://localhost:4321/login",
        "http://localhost:4321/register",
        "http://localhost:4321/dashboard",
      ],
      numberOfRuns: 3,
    },
    assert: {
      // Kryteria performance zgodnie z planem testów
      assertions: {
        "categories:performance": ["error", { minScore: 0.8 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.8 }],
        "categories:seo": ["error", { minScore: 0.8 }],

        // Performance budget
        "first-contentful-paint": ["error", { maxNumericValue: 2000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 3000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 500 }],

        // Bundle size limits
        "unused-javascript": ["warn", { maxNumericValue: 50000 }],
        "unminified-javascript": "off", // Wyłączamy w development

        // Accessibility requirements
        "color-contrast": "error",
        "image-alt": "error",
        label: "error",
        "link-name": "error",
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
    server: {
      port: 9009,
      storage: "./lighthouse-ci-results",
    },
  },
};
