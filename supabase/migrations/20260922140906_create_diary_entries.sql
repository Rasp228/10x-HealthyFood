-- Migracja: Utworzenie tabeli wpisów dziennika (diary_entries)
-- Data: 2026-09-22
-- Autor: System
-- Opis: Tworzy typ wyliczeniowy calorie_origin_enum, tabelę diary_entries, indeks
--       oraz polityki bezpieczeństwa (RLS), dzięki którym wpis dziennika jest prywatny
--       dla swojego właściciela. Migracja nie zmienia żadnej istniejącej tabeli,
--       kolumny, polityki ani typu wyliczeniowego.

-- -----------------------------------------------------------------------------
-- 1. Tworzenie typów wyliczeniowych
-- -----------------------------------------------------------------------------

-- Pochodzenie wartości kalorycznej wpisu - jeden krok kaskady wyznaczania kalorii
create type calorie_origin_enum as enum (
  'recipe_nutrition',      -- FR-009: dane deklarujące się jako "na porcję", przeskalowane przez liczbę porcji
  'ai_from_recipe',        -- FR-010: oszacowanie na podstawie treści samego przepisu
  'ai_from_description',   -- FR-003: oszacowanie na podstawie opisu wpisanego przez użytkownika
  'manual'                 -- FR-004: wartość wpisana ręcznie przez użytkownika
);

-- -----------------------------------------------------------------------------
-- 2. Tworzenie tabel
-- -----------------------------------------------------------------------------

-- Tabela diary_entries - przechowuje wpisy dziennika posiłków użytkowników
create table diary_entries (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- entry_date to zwykła data przekazywana przez klienta, nigdy wyprowadzana z timestampu
  -- po stronie serwera: wpis dodany o 01:30 w Warszawie to 23:30 UTC dnia poprzedniego,
  -- więc wyprowadzanie dnia zapisałoby posiłek pod błędną datą.
  entry_date date not null,
  content text not null check (char_length(content) <= 500),
  portions numeric(6,2) check (portions is null or portions > 0),
  amount_text varchar(100),
  -- on delete set null, nie cascade: wpis trzyma własną kopię content oraz zapisane calories,
  -- więc usunięcie przepisu zostawia minione dni bez zmian liczbowych.
  source_recipe_id integer references recipes(id) on delete set null,
  calories integer check (calories is null or calories >= 0),
  calorie_origin calorie_origin_enum,
  -- Celowo bez wartości domyślnej, inaczej niż sąsiednie znaczniki czasu: default stemplowałby
  -- każdy insert (także wpisy ręczne) i każdy wiersz czytałby się jako "poproszono o oszacowanie".
  -- Kolumnę zapisuje serwer przez now() w momencie zlecenia oszacowania; klient jej nie podaje,
  -- bo jego zegar przesuwałby granicę jednej minuty o własny błąd.
  estimation_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Baza pilnuje wyłącznie tego, że wartość kaloryczna i jej pochodzenie występują razem.
  -- Osobna, NIEEGZEKWOWANA przez bazę reguła: każda ścieżka zerująca calories musi w tej samej
  -- instrukcji wyzerować także estimation_requested_at, inaczej wiersz czyta się jako
  -- oszacowanie, które nigdy nie dotarło. Wiersz z calories is null i ustawionym
  -- estimation_requested_at przejdzie ten check - tej połowy pilnuje route, nie baza.
  constraint diary_entries_value_has_origin
    check ((calories is null) = (calorie_origin is null))
);

-- -----------------------------------------------------------------------------
-- 3. Tworzenie indeksów dla optymalizacji zapytań
-- -----------------------------------------------------------------------------

-- Indeks dla wpisów dziennika po user_id i entry_date
create index idx_diary_entries_user_date on diary_entries(user_id, entry_date);

-- -----------------------------------------------------------------------------
-- 4. Konfiguracja Row-Level Security (RLS)
-- -----------------------------------------------------------------------------

alter table diary_entries enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Polityki RLS dla użytkownika anonimowego (anon)
-- -----------------------------------------------------------------------------

create policy "anon_cannot_select_diary_entries"
  on diary_entries for select to anon
  using (false);

create policy "anon_cannot_insert_diary_entries"
  on diary_entries for insert to anon
  with check (false);

create policy "anon_cannot_update_diary_entries"
  on diary_entries for update to anon
  using (false) with check (false);

create policy "anon_cannot_delete_diary_entries"
  on diary_entries for delete to anon
  using (false);

-- -----------------------------------------------------------------------------
-- 6. Polityki RLS dla zalogowanego użytkownika (authenticated)
-- -----------------------------------------------------------------------------

create policy "users_can_select_own_diary_entries"
  on diary_entries for select to authenticated
  using (user_id = auth.uid());

create policy "users_can_insert_own_diary_entries"
  on diary_entries for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_can_update_own_diary_entries"
  on diary_entries for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_can_delete_own_diary_entries"
  on diary_entries for delete to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Koniec migracji
-- -----------------------------------------------------------------------------
