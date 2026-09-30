-- Skrypt weryfikacyjny: polityki RLS tabeli user_settings
-- Data: 2026-09-30
-- Autor: System
-- Opis: Powtarzalny dowód na to, że polityki z migracji create_user_settings istnieją
--       ORAZ że faktycznie działają. Skrypt uruchamiamy w edytorze SQL Supabase po
--       zaaplikowaniu migracji i ponownie po każdej przyszłej zmianie dotykającej tej tabeli.
--
-- Wymagania wstępne:
--   * zaaplikowana migracja tworząca user_settings,
--   * dwa istniejące konta w auth.users - kolumna user_id ma klucz obcy do auth.users(id),
--     więc syntetyczny uuid nie przejdzie. Jednym może być konto testowe, drugim
--     jednorazowe konto techniczne.
--
-- Użycie: podmień w całym pliku <uuid-a> i <uuid-b> na prawdziwe identyfikatory z auth.users
-- (bez nawiasów ostrokątnych), a potem uruchom CAŁY plik. Identyfikatory odczytasz zapytaniem:
--   select id, email from auth.users order by created_at limit 5;
-- Edytor SQL Supabase nie obsługuje zmiennych psql, więc podstawienie jest ręczne.
--
-- Jak czytać wynik: cała asercja izolacji siedzi w jednym bloku `do` (sekcja 3), który KOŃCZY
-- SIĘ CELOWYM WYJĄTKIEM. Ten wyjątek to nie awaria - to jest wynik. Zaczyna się od [PASS] albo
-- [FAIL] i wypisuje każdą mierzoną wartość obok wartości wymaganej. Wyjątek jest tu podwójnie
-- użyteczny: edytor SQL pokazuje błąd zawsze (w przebiegu wieloinstrukcyjnym wyświetla wynik
-- tylko ostatniej instrukcji, więc zwykłe `select`-y w środku transakcji byłyby niewidoczne),
-- a przerwanie bloku bezwarunkowo wycofuje wszystko, co blok zrobił - także wtedy, gdy asercja
-- padnie w połowie. Dlatego blok `do`, a nie `begin/rollback`: nie da się go wykonać "do połowy",
-- więc zaznaczenie fragmentu nie zatwierdzi już niczego na stałe.
--
-- Skrypt nie dotyka żadnej tabeli poza user_settings i nie zostawia po sobie zmian: prawdziwy
-- cel któregoś z dwóch kont, jeśli istnieje, wraca razem z rollbackiem bloku.

-- -----------------------------------------------------------------------------
-- 1. Asercja pierwsza (tylko odczyt): osiem polityk o oczekiwanych nazwach
-- -----------------------------------------------------------------------------

-- Sekcja 3 sprawdza te nazwy automatycznie i wypisuje brakujące. Poniższe dwa zapytania są
-- tylko do obejrzenia predykatów gołym okiem - są wyłącznie do odczytu, więc uruchomienie
-- samego tego fragmentu jest bezpieczne.
--
-- Oczekiwany wynik: dokładnie 8 wierszy -
--   anon_cannot_select_user_settings, anon_cannot_insert_user_settings,
--   anon_cannot_update_user_settings, anon_cannot_delete_user_settings,
--   users_can_select_own_user_settings, users_can_insert_own_user_settings,
--   users_can_update_own_user_settings, users_can_delete_own_user_settings
select policyname, roles, cmd, qual, with_check
from pg_policies
where tablename = 'user_settings'
order by policyname;

-- Kontrola samego włączenia RLS - oczekiwane: jeden wiersz z rowsecurity = true
select relname, relrowsecurity as rowsecurity
from pg_class
where relname = 'user_settings';

-- -----------------------------------------------------------------------------
-- 2. Sprzątanie: wewnątrz bloku z sekcji 3, nie tutaj
-- -----------------------------------------------------------------------------

-- Inaczej niż w diary-entries-rls.sql nie ma tu samodzielnego `delete`. Wiersz user_settings
-- nie niesie żadnego znacznika testu (w diary_entries był nim prefiks `content`), a jego kluczem
-- jest samo user_id - więc wiersz testowy i prawdziwy cel konta A albo B są nie do odróżnienia,
-- a zatwierdzony delete skasowałby prawdziwy cel. Blok z sekcji 3 usuwa oba wiersze na własny
-- użytek i przywraca je rollbackiem wymuszonym przez wyjątek. Poniższe zapytanie jest tylko do
-- odczytu: pokazuje stan przed przebiegiem i po nim - ma wyjść identyczny.
select user_id, daily_calorie_goal, updated_at
from user_settings
where user_id in ('<uuid-a>'::uuid, '<uuid-b>'::uuid)
order by user_id;

-- -----------------------------------------------------------------------------
-- 3. Asercja druga: polityki naprawdę gryzą (izolacja między użytkownikami)
-- -----------------------------------------------------------------------------

-- Zwykłym zapytaniem "cross-user" niczego się tu nie udowodni: edytor SQL Supabase pracuje
-- na roli superużytkownika, która całkowicie omija RLS, więc takie zapytanie zwróciłoby
-- zero wierszy także przy wyłączonych politykach - przeszłoby również na tabeli bez RLS.
-- Dlatego wcielamy się jawnie w każdego z użytkowników: auth.uid() rozwiązuje się do
-- request.jwt.claims ->> 'sub', więc poniższe sprawdza prawdziwy predykat polityki,
-- a nie brak danych.

do $$
declare
  polityki_oczekiwane text[] := array[
    'anon_cannot_select_user_settings',
    'anon_cannot_insert_user_settings',
    'anon_cannot_update_user_settings',
    'anon_cannot_delete_user_settings',
    'users_can_select_own_user_settings',
    'users_can_insert_own_user_settings',
    'users_can_update_own_user_settings',
    'users_can_delete_own_user_settings'
  ];
  polityki_znalezione text[];
  polityki_brakujace  text[];
  rls_wlaczone boolean;
  rola      text;
  rola_anon text;
  uid_a  text;
  uid_b  text;
  b_wstawia_za_a   text;
  a_wstawia_wlasny bigint;
  a_widzi_wlasny   bigint;
  a_obce   bigint;
  b_wstawia_wlasny bigint;
  b_obce   bigint;
  b_wlasne bigint;
  b_zmienia_obcy  bigint;
  b_usuwa_obcy    bigint;
  b_zmienia_wlasny bigint;
  a_nietkniety bigint;
  anon_widzi   bigint;
  werdykt  text;
begin
  -- 3a. Nazwy polityk i samo włączenie RLS (czytane jeszcze jako właściciel).
  select array_agg(policyname order by policyname)
    into polityki_znalezione
  from pg_policies
  where tablename = 'user_settings';

  select array_agg(p order by p)
    into polityki_brakujace
  from unnest(polityki_oczekiwane) as p
  where p <> all (coalesce(polityki_znalezione, '{}'::text[]));

  select relrowsecurity
    into rls_wlaczone
  from pg_class
  where relname = 'user_settings';

  -- 3b. Czysty start dla obu podmiotów, jeszcze jako właściciel (z pominięciem RLS). Ten delete
  -- wycofa wyjątek z 3h razem z całą resztą bloku, więc prawdziwe cele kont A i B przetrwają.
  -- Bez niego próba z 3d mogłaby paść na kluczu głównym zamiast na polityce.
  delete from user_settings
   where user_id in ('<uuid-a>'::uuid, '<uuid-b>'::uuid);

  -- 3c. Przełączenie na rolę aplikacyjną. set_config(..., true) to odpowiednik SET LOCAL, czyli
  -- obowiązuje do końca tego bloku. Jeśli `rola` nie wyjdzie 'authenticated', liczniki poniżej
  -- lecą jako superużytkownik omijający RLS i nic nie znaczą - dlatego jest w asercji.
  perform set_config('role', 'authenticated', true);
  rola := current_user;

  -- 3d. Użytkownik B nie wstawia wiersza z user_id = A. W tym momencie A nie ma żadnego wiersza
  -- (3b), więc klucz główny nie ma z czym kolidować i jedyną rzeczą, która może tę próbę
  -- zatrzymać, jest `with check` polityki INSERT. Naruszenie `with check` to błąd 42501; konflikt
  -- klucza (23505) jest liczony osobno i oblewa asercję, bo niczego o polityce nie dowodzi.
  -- Podblok ma własny savepoint, więc wycofuje tylko tę próbę.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-b>","role":"authenticated"}', true);
  uid_b := (auth.uid())::text;
  begin
    insert into user_settings (user_id, daily_calorie_goal)
    values ('<uuid-a>'::uuid, 9999);
    b_wstawia_za_a := 'przepuszczone';
  exception
    when insufficient_privilege then
      b_wstawia_za_a := 'odrzucone';
    when unique_violation then
      b_wstawia_za_a := 'konflikt klucza';
  end;

  -- 3e. Kontrola pozytywna: A wstawia WŁASNY wiersz przez te same polityki. Bez niej
  -- "odrzucone" z 3d przeszłoby też przy polityce `with check (false)`, która blokuje wszystko -
  -- a wtedy pierwszy zapis celu (upsert → insert) kończyłby się błędem dla każdego.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-a>","role":"authenticated"}', true);
  uid_a := (auth.uid())::text;
  insert into user_settings (user_id, daily_calorie_goal)
  values ('<uuid-a>'::uuid, 2000);
  get diagnostics a_wstawia_wlasny = row_count;

  select
    count(*) filter (where user_id =  '<uuid-a>'::uuid),
    count(*) filter (where user_id <> '<uuid-a>'::uuid)
    into a_widzi_wlasny, a_obce
  from user_settings;

  -- 3f. Użytkownik B: własny wiersz, potem próby na wierszu A.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-b>","role":"authenticated"}', true);
  insert into user_settings (user_id, daily_calorie_goal)
  values ('<uuid-b>'::uuid, 2500);
  get diagnostics b_wstawia_wlasny = row_count;

  -- B nie widzi wiersza A, choć ten istnieje (3e).
  select
    count(*) filter (where user_id <> '<uuid-b>'::uuid),
    count(*) filter (where user_id =  '<uuid-b>'::uuid)
    into b_obce, b_wlasne
  from user_settings;

  -- B nie zmienia i nie usuwa celu A, nawet wskazanego po kluczu. Na tych politykach stoi
  -- PUT /api/user-settings. Oba zapytania mają trafić zero wierszy - `row_count` mierzy to,
  -- co polityka faktycznie przepuściła.
  update user_settings
     set daily_calorie_goal = 9999
   where user_id = '<uuid-a>'::uuid;
  get diagnostics b_zmienia_obcy = row_count;

  delete from user_settings
   where user_id = '<uuid-a>'::uuid;
  get diagnostics b_usuwa_obcy = row_count;

  -- Kontrola pozytywna UPDATE: ta sama polityka przepuszcza zmianę WŁASNEGO celu. Bez niej zero
  -- z próby na wierszu A przeszłoby też przy `using (false)`, a wtedy każda zmiana celu
  -- (upsert → update) nie zapisywałaby niczego.
  update user_settings
     set daily_calorie_goal = 3000
   where user_id = '<uuid-b>'::uuid;
  get diagnostics b_zmienia_wlasny = row_count;

  -- 3g. Wiersz A nadal istnieje z pierwotną wartością - drugi dowód, że próby B niczego nie
  -- ruszyły. Czytane jako A, bo B go nie widzi.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-a>","role":"authenticated"}', true);
  select count(*)
    into a_nietkniety
  from user_settings
  where user_id = '<uuid-a>'::uuid
    and daily_calorie_goal = 2000;

  -- 3g'. Anon nie widzi niczego, choć w tabeli leżą teraz wiersze A i B.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  rola_anon := current_user;
  select count(*)
    into anon_widzi
  from user_settings;

  werdykt := case
    when coalesce(array_length(polityki_brakujace, 1), 0) = 0
     and coalesce(rls_wlaczone, false)
     and rola = 'authenticated'
     and rola_anon = 'anon'
     and uid_a = '<uuid-a>'
     and uid_b = '<uuid-b>'
     and b_wstawia_za_a = 'odrzucone'
     and a_wstawia_wlasny = 1
     and a_widzi_wlasny = 1
     and a_obce = 0
     and b_wstawia_wlasny = 1
     and b_obce = 0
     and b_wlasne = 1
     and b_zmienia_obcy = 0
     and b_usuwa_obcy = 0
     and b_zmienia_wlasny = 1
     and a_nietkniety = 1
     and anon_widzi = 0
    then 'PASS'
    else 'FAIL'
  end;

  -- 3h. Wyjątek jest celowy: to jednocześnie raport i gwarancja wycofania zmian z bloku.
  raise exception using message = format(
    E'[%s] Asercja RLS user_settings. Wyjatek jest celowy - wymusza rollback zmian testowych.\n'
    E'  polityki znalezione  : %s z 8\n'
    E'  polityki brakujace   : %s\n'
    E'  RLS wlaczone         : %s   (wymagane: t)\n'
    E'  rola po przelaczeniu : %s   (wymagane: authenticated)\n'
    E'  auth.uid() dla B     : %s   (wymagane: <uuid-b>)\n'
    E'  B wstawia za A       : %s   (wymagane: odrzucone)\n'
    E'  auth.uid() dla A     : %s   (wymagane: <uuid-a>)\n'
    E'  A wstawia wlasny     : %s   (wymagane: 1)\n'
    E'  A widzi wlasny       : %s   (wymagane: 1)\n'
    E'  A widzi cudzych      : %s   (wymagane: 0)\n'
    E'  B wstawia wlasny     : %s   (wymagane: 1)\n'
    E'  B widzi cudzych      : %s   (wymagane: 0)\n'
    E'  B widzi wlasnych     : %s   (wymagane: 1)\n'
    E'  B zmienia cel A      : %s   (wymagane: 0)\n'
    E'  B usuwa cel A        : %s   (wymagane: 0)\n'
    E'  B zmienia wlasny     : %s   (wymagane: 1)\n'
    E'  cel A nietkniety     : %s   (wymagane: 1)\n'
    E'  rola anon            : %s   (wymagane: anon)\n'
    E'  anon widzi wierszy   : %s   (wymagane: 0)',
    werdykt,
    coalesce(array_length(polityki_znalezione, 1), 0),
    coalesce(array_to_string(polityki_brakujace, ', '), 'brak'),
    rls_wlaczone,
    rola,
    uid_b,
    b_wstawia_za_a,
    uid_a,
    a_wstawia_wlasny,
    a_widzi_wlasny,
    a_obce,
    b_wstawia_wlasny,
    b_obce,
    b_wlasne,
    b_zmienia_obcy,
    b_usuwa_obcy,
    b_zmienia_wlasny,
    a_nietkniety,
    rola_anon,
    anon_widzi
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Koniec skryptu weryfikacyjnego
-- -----------------------------------------------------------------------------
