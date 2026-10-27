---
title: "10x-HealthyFood — słownik domeny dla agentów"
created: 2026-10-26
type: glossary
---

# Słownik domeny

Krótki słownik dla agentów. Dowody i źródła: `context/domain/01-domain-distillation.md`.

## Przepisy i generowanie

| Termin | Co znaczy | Nazwa w kodzie | Jak tego NIE nazywać |
| --- | --- | --- | --- |
| Przepis | Własny przepis użytkownika | `recipes`, `RecipeDto` | „danie", „posiłek" (to wpis dziennika) |
| Treść przepisu | Pełny tekst przepisu, w nim ewentualny blok odżywczy | `recipes.content` | „opis" (opis należy do wpisu dziennika) |
| Dodatkowe parametry | Wolny tekst przy przepisie | `additional_params` | „preferencje" (preferencje są w profilu) |
| Przepis bazowy | Przepis wklejony jako punkt wyjścia dla AI | `base_recipe` | „szablon", „oryginał" |
| Generowanie / modyfikacja | Dwie akcje AI na przepisach | `generate_new` / `generate_modification` | „wycena" (wycena dotyczy kalorii) |
| Log akcji AI | Telemetria wywołania modelu przy przepisach | tabela `logs`, `is_accepted` | „wpis", „log posiłku" |

## Profil żywieniowy

| Termin | Co znaczy | Nazwa w kodzie | Jak tego NIE nazywać |
| --- | --- | --- | --- |
| Preferencja żywieniowa | Para kategoria + wartość, trafia do promptu przepisu | `preferences` | „ustawienie", „cel" |
| Kategoria preferencji | `lubiane`, `nielubiane`, `wykluczone`, `diety` — po polsku, tak w bazie | `preference_category_enum` | tłumaczenia (`liked`, `excluded`…) |
| Profil | Ekran z preferencjami i celem — nie rekord w bazie | `src/pages/profile.astro` | „tabela profilu", „pole na profilu" |

## Dziennik kaloryczny

| Termin | Co znaczy | Nazwa w kodzie | Jak tego NIE nazywać |
| --- | --- | --- | --- |
| Wpis dziennika | Jedna rzecz zjedzona danego dnia, samowystarczalna kopia | `diary_entries`, `DiaryEntryDto` | „log", „posiłek z przepisu", „rekord przepisu" |
| Dzień dziennika | Data kalendarzowa klienta `RRRR-MM-DD` | `entry_date` | „timestamp", „data utworzenia" |
| Opis posiłku | Co zjadłem — tekst wpisu | `diary_entries.content` | „treść przepisu" |
| Ilość | Tekst ilości we wpisie opisowym | `amount_text` | „porcje" |
| Liczba porcji | Ile porcji przepisu zjedzono (domyślnie 1) | `portions` | „ilość", „porcja przepisu" |
| Przepis źródłowy | Własny przepis, z którego powstał wpis; niezmienny | `source_recipe_id` | „przepis wpisu do edycji" |
| Wartość kaloryczna | kcal wpisu, 0–5000 | `calories` | „kalorie przepisu" (przepis nie ma kolumny kalorii) |
| Pochodzenie wartości | Skąd wzięła się liczba | `calorie_origin`: `recipe_nutrition`, `ai_from_recipe`, `ai_from_description`, `manual` | „źródło AI", „typ wpisu" |
| Kaskada wartości | Kolejność źródeł: blok przepisu → AI z przepisu → AI z opisu → ręcznie | brak nazwy w kodzie | „fallback", „heurystyka" |
| Blok samodeklarujący porcję | Blok w treści przepisu z nagłówkiem mówiącym, że opisuje jedną porcję | `recipe-nutrition.ts` | „parsowanie wartości odżywczych" (to interpretacja, nie dowolny parsing) |
| Wycena | Zlecenie AI policzenia wartości wpisu | `POST /api/diary-entries/:id/estimate`, „Policz kalorie" | „generowanie", „kalkulacja przepisu" |
| Znacznik zlecenia wyceny | Czas serwera zlecenia; tylko najnowsze zlecenie może zapisać wynik | `estimation_requested_at` | „status", „flaga" |
| Stan wartości | `valued`, `estimating`, `stale` („Nie policzono"), `unavailable` („AI niedostępne"), `idle` | `EstimationState` | „błąd wyceny" dla `stale` |
| Przeliczenie | Jawne żądanie ponownego ustalenia wartości po edycji | `recalculate`, „Zapisz i przelicz" | „automatyczne odświeżenie" — nigdy nie jest automatyczne |
| Sierota | Wpis z porcjami, którego przepis usunięto | `portions` ≠ null, `source_recipe_id` = null | „uszkodzony wpis" |
| Suma dnia | Suma wartości dnia plus liczba wpisów bez wartości | `summarizeDay` → `calorieTotal`, `missingCount` | „total" (to też liczba wierszy listy) |
| Dzienny cel | Opcjonalna liczba 500–10000; `null` = brak | `user_settings.daily_calorie_goal` | „preferencja", „pole profilu" |
| Postęp celu | `under`, `reached`, `over` — przekroczenie to nie błąd | `goalProgress` | „przekroczenie limitu", „błąd" |
| Uprzedzenie o wysyłce | Zdanie przy przycisku wyceny, że treść jedzie do dostawcy | `AI_NOTICE`, `AI_NOTICE_RECIPE` | „zgoda", „disclaimer prawny" |

## Słowa wieloznaczne — zawsze z przymiotnikiem

| Słowo | Używaj zamiast niego |
| --- | --- |
| log / logowanie | „wpis dziennika" (posiłek), „log akcji AI" (`logs`), „linia logu" (obserwowalność), „logowanie się" (sesja) |
| porcja | „porcja przepisu" (to, co opisuje blok) vs „liczba porcji" (ile zjedzono) |
| treść / content | „treść przepisu" vs „opis posiłku" |
| preferencje | „preferencje żywieniowe" (profil) vs „dodatkowe parametry" (przepis) |
| total | „suma dnia" (kcal) vs „liczba wierszy" vs „wartość wpisu" |
| AI / model | „generator przepisów" (`AIService`) vs „wycena kalorii" (`CalorieEstimationService`) |

Pojęcia, których w tym produkcie celowo nie ma: baza produktów spożywczych, makroskładniki,
statystyki ponad jeden dzień, udostępnianie dziennika.
