-- Migracja: Utworzenie schematu bazy danych HealthyMeal
-- Data: 2025-04-27
-- Autor: System
-- Opis: Inicjalna migracja tworząca typy wyliczeniowe, tabele, indeksy oraz polityki bezpieczeństwa
--       dla systemu HealthyMeal zgodnie z planem bazy danych.

-- -----------------------------------------------------------------------------
-- 1. Tworzenie typów wyliczeniowych
-- -----------------------------------------------------------------------------

-- Kategorie preferencji
create type preference_category_enum as enum (
  'lubiane',
  'nielubiane',
  'wykluczone',
  'diety'
);

-- Typy akcji dla logów
create type action_type_enum as enum (
  'generate_new',
  'generate_modification'
);

-- -----------------------------------------------------------------------------
-- 2. Tworzenie tabel
-- -----------------------------------------------------------------------------

-- Tabela preferences - przechowuje preferencje użytkowników
create table preferences (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category preference_category_enum not null,
  value varchar(50) not null check (char_length(value) <= 50),
  created_at timestamptz not null default now(),
  
  -- Unikalna kombinacja użytkownika, kategorii i wartości
  constraint preferences_unique_user_category_value unique (user_id, category, value)
);

-- Tabela recipes - przechowuje przepisy użytkowników
create table recipes (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title varchar(255) not null,
  content text not null check (char_length(content) <= 5000),
  additional_params text check (char_length(additional_params) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tabela logs - przechowuje logi akcji użytkowników
create table logs (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type action_type_enum not null,
  is_accepted boolean,
  actual_ai_model text not null,
  generate_response_time integer not null, -- czas w milisekundach
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Tworzenie indeksów dla optymalizacji zapytań
-- -----------------------------------------------------------------------------

-- Indeks dla preferencji po user_id
create index idx_preferences_user_id on preferences(user_id);

-- Indeks dla przepisów po user_id i created_at
create index idx_recipes_user_created on recipes(user_id, created_at);

-- Indeks dla logów po user_id i created_at
create index idx_logs_user_created on logs(user_id, created_at);

-- -----------------------------------------------------------------------------
-- 4. Konfiguracja Row-Level Security (RLS)
-- -----------------------------------------------------------------------------

-- Włączenie RLS dla wszystkich tabel
alter table preferences enable row level security;
alter table recipes enable row level security;
alter table logs enable row level security;

-- -----------------------------------------------------------------------------
-- 5. Polityki RLS dla użytkownika anonimowego (anon)
-- -----------------------------------------------------------------------------

-- Polityki dla tabeli preferences
create policy "anon_cannot_select_preferences" 
  on preferences for select to anon
  using (false);

create policy "anon_cannot_insert_preferences" 
  on preferences for insert to anon
  with check (false);

create policy "anon_cannot_update_preferences" 
  on preferences for update to anon
  using (false) with check (false);

create policy "anon_cannot_delete_preferences" 
  on preferences for delete to anon
  using (false);

-- Polityki dla tabeli recipes
create policy "anon_cannot_select_recipes" 
  on recipes for select to anon
  using (false);

create policy "anon_cannot_insert_recipes" 
  on recipes for insert to anon
  with check (false);

create policy "anon_cannot_update_recipes" 
  on recipes for update to anon
  using (false) with check (false);

create policy "anon_cannot_delete_recipes" 
  on recipes for delete to anon
  using (false);

-- Polityki dla tabeli logs
create policy "anon_cannot_select_logs" 
  on logs for select to anon
  using (false);

create policy "anon_cannot_insert_logs" 
  on logs for insert to anon
  with check (false);

create policy "anon_cannot_update_logs" 
  on logs for update to anon
  using (false) with check (false);

create policy "anon_cannot_delete_logs" 
  on logs for delete to anon
  using (false);

-- -----------------------------------------------------------------------------
-- 6. Polityki RLS dla zalogowanego użytkownika (authenticated)
-- -----------------------------------------------------------------------------

-- Polityki dla tabeli preferences
create policy "users_can_select_own_preferences" 
  on preferences for select to authenticated
  using (user_id = auth.uid());

create policy "users_can_insert_own_preferences" 
  on preferences for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_can_update_own_preferences" 
  on preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_can_delete_own_preferences" 
  on preferences for delete to authenticated
  using (user_id = auth.uid());

-- Polityki dla tabeli recipes
create policy "users_can_select_own_recipes" 
  on recipes for select to authenticated
  using (user_id = auth.uid());

create policy "users_can_insert_own_recipes" 
  on recipes for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_can_update_own_recipes" 
  on recipes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_can_delete_own_recipes" 
  on recipes for delete to authenticated
  using (user_id = auth.uid());

-- Polityki dla tabeli logs
create policy "users_can_select_own_logs" 
  on logs for select to authenticated
  using (user_id = auth.uid());

create policy "users_can_insert_own_logs" 
  on logs for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_can_update_own_logs" 
  on logs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_can_delete_own_logs" 
  on logs for delete to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Koniec migracji
-- ----------------------------------------------------------------------------- 