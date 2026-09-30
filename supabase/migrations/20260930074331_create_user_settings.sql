-- Migracja: Utworzenie tabeli ustawień użytkownika (user_settings)
-- Data: 2026-09-30
-- Autor: System
-- Opis: Tworzy tabelę user_settings z jedną opcjonalną kolumną dziennego celu kalorycznego
--       oraz polityki bezpieczeństwa (RLS), dzięki którym ustawienia są prywatne dla swojego
--       właściciela. Migracja nie zmienia żadnej istniejącej tabeli, kolumny, polityki ani
--       typu wyliczeniowego.
--
-- Dlaczego cel nie leży w tabeli preferences: każdy wiersz preferences trafia do promptu
-- generowania przepisów (AIService.getUserPreferences), POST /api/preferences ma limit wierszy,
-- a kategoria to enum preference_category_enum o wartościach zapisywanych wprost do bazy.
-- Cel jako "preferencja" wymagałby nowej wartości enuma, przeciekałby do promptu AI i dzieliłby
-- limit z preferencjami żywieniowymi. Osobna, wąska tabela sprawia, że zapis celu nie dotyka
-- żadnego istniejącego wiersza preferencji.

-- -----------------------------------------------------------------------------
-- 1. Tworzenie tabel
-- -----------------------------------------------------------------------------

-- Tabela user_settings - co najwyżej jeden wiersz ustawień na użytkownika
create table user_settings (
  -- user_id jest kluczem głównym, a nie zwykłą kolumną obok serial id: jeden użytkownik ma
  -- najwyżej jeden wiersz, a zapis celu to upsert po user_id. Brak wiersza oznacza "brak celu".
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- null = użytkownik nie ustawił celu (albo go usunął). Zakres 500-10000 jest zdublowany
  -- w schemacie Zod trasy; ten check to ostatnia linia obrony, nie jedyna walidacja.
  daily_calorie_goal integer
    check (daily_calorie_goal is null or daily_calorie_goal between 500 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Konfiguracja Row-Level Security (RLS)
-- -----------------------------------------------------------------------------

alter table user_settings enable row level security;

-- -----------------------------------------------------------------------------
-- 3. Polityki RLS dla użytkownika anonimowego (anon)
-- -----------------------------------------------------------------------------

create policy "anon_cannot_select_user_settings"
  on user_settings for select to anon
  using (false);

create policy "anon_cannot_insert_user_settings"
  on user_settings for insert to anon
  with check (false);

create policy "anon_cannot_update_user_settings"
  on user_settings for update to anon
  using (false) with check (false);

create policy "anon_cannot_delete_user_settings"
  on user_settings for delete to anon
  using (false);

-- -----------------------------------------------------------------------------
-- 4. Polityki RLS dla zalogowanego użytkownika (authenticated)
-- -----------------------------------------------------------------------------

-- Upsert celu trafia zarówno w politykę INSERT (pierwszy zapis), jak i UPDATE (każdy kolejny),
-- więc obie muszą przepuszczać user_id = auth.uid().

create policy "users_can_select_own_user_settings"
  on user_settings for select to authenticated
  using (user_id = auth.uid());

create policy "users_can_insert_own_user_settings"
  on user_settings for insert to authenticated
  with check (user_id = auth.uid());

create policy "users_can_update_own_user_settings"
  on user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users_can_delete_own_user_settings"
  on user_settings for delete to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Koniec migracji
-- -----------------------------------------------------------------------------
