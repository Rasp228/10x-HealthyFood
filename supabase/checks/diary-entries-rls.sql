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
-- (bez nawiasów ostrokątnych), a potem uruchom CAŁY plik. Identyfikatory odczytasz zapytaniem:
--   select id, email from auth.users order by created_at limit 5;
-- Edytor SQL Supabase nie obsługuje zmiennych psql, więc podstawienie jest ręczne.
--
-- Jak czytać wynik: cała asercja izolacji siedzi w jednym bloku `do` (sekcja 3), który KOŃCZY
-- SIĘ CELOWYM WYJĄTKIEM. Ten wyjątek to nie awaria - to jest wynik. Zaczyna się od [PASS] albo
-- [FAIL] i wypisuje każdą mierzoną wartość obok wartości wymaganej. Wyjątek jest tu podwójnie
-- użyteczny: edytor SQL pokazuje błąd zawsze (w przebiegu wieloinstrukcyjnym wyświetla wynik
-- tylko ostatniej instrukcji, więc zwykłe `select`-y w środku transakcji byłyby niewidoczne),
-- a przerwanie bloku bezwarunkowo wycofuje wiersze testowe - także wtedy, gdy asercja padnie
-- w połowie. Dlatego blok `do`, a nie `begin/rollback`: nie da się go wykonać "do połowy",
-- więc zaznaczenie fragmentu nie zatwierdzi już niczego na stałe.
--
-- Skrypt nie dotyka żadnej tabeli poza diary_entries i nie zostawia po sobie wierszy.

-- -----------------------------------------------------------------------------
-- 1. Asercja pierwsza (tylko odczyt): osiem polityk o oczekiwanych nazwach
-- -----------------------------------------------------------------------------

-- Sekcja 3 sprawdza te nazwy automatycznie i wypisuje brakujące. Poniższe dwa zapytania są
-- tylko do obejrzenia predykatów gołym okiem - są wyłącznie do odczytu, więc uruchomienie
-- samego tego fragmentu jest bezpieczne.
--
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
-- 2. Siatka bezpieczeństwa: sprzątanie po ewentualnym wcześniejszym przebiegu
-- -----------------------------------------------------------------------------

-- Blok z sekcji 3 sam wycofuje swoje wiersze, więc normalnie nie ma tu czego usuwać. To jest
-- zabezpieczenie na wypadek starszego przebiegu przerwanego w nietypowy sposób. Stoi PRZED
-- asercją, żeby ostatnią widoczną rzeczą w przebiegu całego pliku był wynik asercji, a nie ten
-- delete.
--
-- Zakres zawężony do dwóch podmiotów testowych, bo tabela ma `enable row level security`, a nie
-- `force` - rola właściciela, na której pracuje edytor SQL, omija wszystkie polityki. Bez warunku
-- na user_id ten delete sięgnąłby wierszy każdego użytkownika, a `content` to swobodny tekst.
-- `returning` pokazuje, co faktycznie zniknęło; przy czystym stanie lista jest pusta.
delete from diary_entries
where user_id in ('<uuid-a>'::uuid, '<uuid-b>'::uuid)
  and content like 'rls check - %'
returning id, user_id, content;

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
    'anon_cannot_select_diary_entries',
    'anon_cannot_insert_diary_entries',
    'anon_cannot_update_diary_entries',
    'anon_cannot_delete_diary_entries',
    'users_can_select_own_diary_entries',
    'users_can_insert_own_diary_entries',
    'users_can_update_own_diary_entries',
    'users_can_delete_own_diary_entries'
  ];
  polityki_znalezione text[];
  polityki_brakujace  text[];
  rls_wlaczone boolean;
  rola   text;
  uid_a  text;
  uid_b  text;
  a_obce   bigint;
  a_wlasne bigint;
  b_obce   bigint;
  b_wlasne bigint;
  werdykt  text;
begin
  -- 3a. Nazwy polityk i samo włączenie RLS (czytane jeszcze jako właściciel).
  select array_agg(policyname order by policyname)
    into polityki_znalezione
  from pg_policies
  where tablename = 'diary_entries';

  select array_agg(p order by p)
    into polityki_brakujace
  from unnest(polityki_oczekiwane) as p
  where p <> all (coalesce(polityki_znalezione, '{}'::text[]));

  select relrowsecurity
    into rls_wlaczone
  from pg_class
  where relname = 'diary_entries';

  -- 3b. Dane testowe: po jednym wierszu dla każdego z dwóch użytkowników. Wstawiane jeszcze
  -- przed przełączeniem roli, czyli z pominięciem RLS. Jedyna tabela, której dotyka ten skrypt.
  insert into diary_entries (user_id, entry_date, content)
  values
    ('<uuid-a>'::uuid, current_date, 'rls check - wpis użytkownika A'),
    ('<uuid-b>'::uuid, current_date, 'rls check - wpis użytkownika B');

  -- 3c. Przełączenie na rolę aplikacyjną. set_config(..., true) to odpowiednik SET LOCAL, czyli
  -- obowiązuje do końca tego bloku. Jeśli `rola` nie wyjdzie 'authenticated', liczniki poniżej
  -- lecą jako superużytkownik omijający RLS i nic nie znaczą - dlatego jest w asercji.
  perform set_config('role', 'authenticated', true);
  rola := current_user;

  -- 3d. Użytkownik A widzi wyłącznie własne wiersze.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-a>","role":"authenticated"}', true);
  uid_a := (auth.uid())::text;
  select
    count(*) filter (where user_id <> '<uuid-a>'::uuid),
    count(*) filter (where user_id =  '<uuid-a>'::uuid)
    into a_obce, a_wlasne
  from diary_entries;

  -- 3e. Użytkownik B widzi wyłącznie własne wiersze.
  perform set_config('request.jwt.claims', '{"sub":"<uuid-b>","role":"authenticated"}', true);
  uid_b := (auth.uid())::text;
  select
    count(*) filter (where user_id <> '<uuid-b>'::uuid),
    count(*) filter (where user_id =  '<uuid-b>'::uuid)
    into b_obce, b_wlasne
  from diary_entries;

  werdykt := case
    when coalesce(array_length(polityki_brakujace, 1), 0) = 0
     and coalesce(rls_wlaczone, false)
     and rola = 'authenticated'
     and uid_a = '<uuid-a>'
     and uid_b = '<uuid-b>'
     and a_obce = 0
     and b_obce = 0
     and a_wlasne >= 1
     and b_wlasne >= 1
    then 'PASS'
    else 'FAIL'
  end;

  -- 3f. Wyjątek jest celowy: to jednocześnie raport i gwarancja wycofania wierszy testowych.
  raise exception using message = format(
    E'[%s] Asercja RLS diary_entries. Wyjatek jest celowy - wymusza rollback wierszy testowych.\n'
    E'  polityki znalezione  : %s z 8\n'
    E'  polityki brakujace   : %s\n'
    E'  RLS wlaczone         : %s   (wymagane: t)\n'
    E'  rola po przelaczeniu : %s   (wymagane: authenticated)\n'
    E'  auth.uid() dla A     : %s   (wymagane: <uuid-a>)\n'
    E'  A widzi cudzych      : %s   (wymagane: 0)\n'
    E'  A widzi wlasnych     : %s   (wymagane: >= 1)\n'
    E'  auth.uid() dla B     : %s   (wymagane: <uuid-b>)\n'
    E'  B widzi cudzych      : %s   (wymagane: 0)\n'
    E'  B widzi wlasnych     : %s   (wymagane: >= 1)',
    werdykt,
    coalesce(array_length(polityki_znalezione, 1), 0),
    coalesce(array_to_string(polityki_brakujace, ', '), 'brak'),
    rls_wlaczone,
    rola,
    uid_a,
    a_obce,
    a_wlasne,
    uid_b,
    b_obce,
    b_wlasne
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Koniec skryptu weryfikacyjnego
-- -----------------------------------------------------------------------------
