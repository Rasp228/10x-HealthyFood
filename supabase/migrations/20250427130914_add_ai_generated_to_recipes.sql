-- Migracja: Dodanie kolumny is_ai_generated do tabeli recipes
-- Data: 2025-04-27
-- Autor: System
-- Opis: Dodanie kolumny informującej czy przepis został wygenerowany przez AI

-- Dodanie kolumny is_ai_generated do tabeli recipes
ALTER TABLE recipes
ADD COLUMN is_ai_generated boolean NOT NULL DEFAULT false;

-- Aktualizacja istniejących przepisów - zakładamy, że wszystkie istniejące przepisy nie były wygenerowane przez AI
UPDATE recipes
SET is_ai_generated = false
WHERE is_ai_generated IS NULL;

-- Dodanie komentarza do kolumny
COMMENT ON COLUMN recipes.is_ai_generated IS 'Informacja czy przepis został wygenerowany przez AI'; 