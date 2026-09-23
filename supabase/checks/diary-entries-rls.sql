-- Skrypt weryfikacyjny: polityki RLS tabeli diary_entries
-- Data: 2026-09-22
-- Autor: System
-- Opis: Powtarzalny dowód na to, że polityki z migracji create_diary_entries istnieją
--       ORAZ że faktycznie działają. Skrypt uruchamiamy w edytorze SQL Supabase po
--       zaaplikowaniu migracji i ponownie po każdej przyszłej zmianie dotykającej tej tabeli.
--
-- Wymagania wstępne:
--   * zaaplikowana migracja tworząca diary_entries,
--   * dwa istniejące konta w auth.users - kolumna user_id ma klucz obcy do auth.users(id),
--     więc syntetyczny uuid nie przejdzie. Jednym może być konto testowe, drugim
--     jednorazowe konto techniczne.
--
-- Użycie: podmień w całym pliku <uuid-a> i <uuid-b> na prawdziwe identyfikatory z auth.users
-- (bez nawiasów ostrokątnych). Identyfikatory odczytasz zapytaniem:
--   select id, email from auth.users order by created_at limit 5;
-- Edytor SQL Supabase nie obsługuje zmiennych psql, więc podstawienie jest ręczne.
--
-- Skrypt nie wstawia, nie zmienia ani nie usuwa niczego poza tabelą diary_entries,
-- a wszystkie zapisy dzieją się w transakcji zakończonej rollbackiem - nie zostawia wierszy.

-- -----------------------------------------------------------------------------
-- 1. Asercja pierwsza (tylko odczyt): osiem polityk o oczekiwanych nazwach
-- -----------------------------------------------------------------------------

-- Oczekiwany wynik: dokładnie 8 wierszy -
--   anon_cannot_select_diary_entries, anon_cannot_insert_diary_entries,
--   anon_cannot_update_diary_entries, anon_cannot_delete_diary_entries,
--   users_can_select_own_diary_entries, users_can_insert_own_diary_entries,
--   users_can_update_own_diary_entries, users_can_delete_own_diary_entries
select policyname, roles, cmd, qual, with_check
from pg_policies
where tablename = 'diary_entries'
order by policyname;

-- Kontrola samego włączenia RLS - oczekiwane: jeden wiersz z rowsecurity = true
select relname, relrowsecurity as rowsecurity
from pg_class
where relname = 'diary_entries';

-- -----------------------------------------------------------------------------
-- 2. Asercja druga: polityki naprawdę gryzą (izolacja między użytkownikami)
-- -----------------------------------------------------------------------------

-- Zwykłym zapytaniem "cross-user" niczego się tu nie udowodni: edytor SQL Supabase pracuje
-- na roli superużytkownika, która całkowicie omija RLS, więc takie zapytanie zwróciłoby
-- zero wierszy także przy wyłączonych politykach - przeszłoby również na tabeli bez RLS.
-- Dlatego wcielamy się jawnie w każdego z użytkowników: auth.uid() rozwiązuje się do
-- request.jwt.claims ->> 'sub', więc poniższe sprawdza prawdziwy predykat polityki,
-- a nie brak danych.

begin;

-- Dane testowe: po jednym wierszu dla każdego z dwóch użytkowników. Wstawiane jeszcze przed
-- przełączeniem roli, czyli z pominięciem RLS. Jedyna tabela, której dotyka ten skrypt.
insert into diary_entries (user_id, entry_date, content)
values
  ('<uuid-a>'::uuid, current_date, 'rls check - wpis użytkownika A'),
  ('<uuid-b>'::uuid, current_date, 'rls check - wpis użytkownika B');

set local role authenticated;

-- Straż: jeśli to nie wypisze authenticated, SET LOCAL poszedł poza transakcją i poniższe
-- liczniki lecą jako superużytkownik omijający RLS - wynik byłby bez znaczenia.
select current_user as musi_byc_authenticated;

-- Użytkownik A widzi wyłącznie własne wiersze
set local request.jwt.claims = '{"sub":"<uuid-a>","role":"authenticated"}';
select
  (auth.uid())::text                                    as musi_byc_uuid_a,
  count(*) filter (where user_id <> '<uuid-a>'::uuid)   as musi_byc_zero,
  count(*) filter (where user_id =  '<uuid-a>'::uuid)   as wiersze_a_min_1
from diary_entries;

-- Użytkownik B widzi wyłącznie własne wiersze
set local request.jwt.claims = '{"sub":"<uuid-b>","role":"authenticated"}';
select
  (auth.uid())::text                                    as musi_byc_uuid_b,
  count(*) filter (where user_id <> '<uuid-b>'::uuid)   as musi_byc_zero,
  count(*) filter (where user_id =  '<uuid-b>'::uuid)   as wiersze_b_min_1
from diary_entries;

-- Opcjonalnie: użytkownik B nie może podszyć się pod A przy zapisie. Instrukcja powinna
-- skończyć się naruszeniem polityki RLS, ale przerywa transakcję, więc domyślnie jest wyłączona.
-- insert into diary_entries (user_id, entry_date, content)
-- values ('<uuid-a>'::uuid, current_date, 'rls check - B podszywa się pod A');

rollback;

-- -----------------------------------------------------------------------------
-- 3. Siatka bezpieczeństwa
-- -----------------------------------------------------------------------------

-- Rollback powyżej usuwa wiersze tylko wtedy, gdy skrypt wykonano w całości. Edytor SQL
-- Supabase uruchamia zaznaczony fragment, więc wykonanie samego bloku insert zatwierdziłoby
-- wiersze na stałe - a to ta sama baza, na której pracuje dev i E2E (.env i .env.test mają
-- identyczny SUPABASE_URL). Poniższe czyści je bezwarunkowo; po pełnym przebiegu usuwa 0 wierszy.
delete from diary_entries where content like 'rls check - %';

-- -----------------------------------------------------------------------------
-- Koniec skryptu weryfikacyjnego
-- -----------------------------------------------------------------------------
