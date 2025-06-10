#!/bin/bash

# Script do lokalnego testowania pipeline CI/CD
# Uruchom: chmod +x scripts/test-pipeline.sh && ./scripts/test-pipeline.sh

set -e  # Zatrzymaj przy pierwszym błędzie

echo "Lokalne testowanie CI/CD Pipeline..."
echo "======================================"

# Sprawdź czy jesteś w root projektu
if [ ! -f "package.json" ]; then
    echo "Błąd: Uruchom skrypt z root projektu!"
    exit 1
fi

# 1. Code Quality
echo ""
echo "Krok 1/5: Kontrola jakości kodu..."
echo "npm run lint"
npm run lint

echo "npm run format -- --check"
if ! npm run format -- --check; then
    echo "Kod nie jest poprawnie sformatowany. Naprawiam..."
    npm run format
    echo "Kod sformatowany poprawnie."
fi

# 2. Unit Tests
echo ""
echo "Krok 2/5: Testy jednostkowe..."
echo "npm run test"
npm run test

# 3. Build
echo ""
echo "Krok 4/5: Build produkcyjny..."
echo "npm run build"
npm run build

# 4. E2E Tests (opcjonalnie)
echo ""
echo "Krok 5/5: Testy E2E (opcjonalne)..."
read -p "Uruchomić testy E2E? Może potrwać kilka minut (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "npm run test:e2e"
    if npm run test:e2e; then
        echo "Testy E2E zakończone sukcesem!"
    else
        echo "Testy E2E nie powiodły się."
        echo "Sprawdź czy aplikacja działa: npm run dev"
        echo "Uruchom testy w trybie debug: npm run test:e2e:debug"
        exit 1
    fi
else
    echo "Pomijam testy E2E."
fi

# Podsumowanie
echo ""
echo "Wszystkie kroki pipeline zakończone sukcesem!"
echo "======================================"
echo "Code Quality"
echo "Unit Tests"
echo "Build"
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "E2E Tests"
else
    echo "E2E Tests (pominięte)"
fi
echo ""
echo "Możesz teraz bezpiecznie pushować kod do repo!"
echo "GitHub Actions uruchomi identyczne testy automatycznie." 