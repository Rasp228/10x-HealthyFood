/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-estimate-route.test.ts`.
 */

import { POST } from "@/pages/api/diary-entries/index";

type RouteContext = Parameters<typeof POST>[0];
type Row = Record<string, unknown>;

const USER_A = "user-a";
const USER_B = "user-b";

/** Przepis 10 należy do A, przepis 20 do B. Treść B ma blok odżywczy, żeby insert dostał wartość. */
const RECIPES: Row[] = [
  { id: 10, user_id: USER_A, content: "Tajny przepis A\n\nWartości odżywcze (porcja):\nKalorie: 300 kcal" },
  { id: 20, user_id: USER_B, content: "Owsianka B\n\nWartości odżywcze (porcja):\nKalorie: 250 kcal" },
];

/** Rejestr insertów do `diary_entries` - dowód, czy wpis w ogóle powstał. */
let inserted: Row[];

/**
 * Stanowa atrapa klienta Supabase z wierszami dwóch właścicieli.
 *
 * Atrapa NIE odpowiada „nie ma” na wszystko: trzyma przepisy A i B i stosuje każde `eq(kolumna,
 * wartość)` do zbioru. Stub zawsze zwracający `null` przeszedłby także po usunięciu filtra
 * `.eq("user_id", …)` z `readOwnRecipeContent` - byłby tautologią. Tu regresja w filtrze oddaje
 * przepis A i czerwieni test 404.
 *
 * Obsługuje tylko łańcuchy, których faktycznie używają trasa i serwis:
 * `from("recipes").select().eq().eq().maybeSingle()` oraz
 * `from("diary_entries").insert().select().single()`.
 */
const createSupabase = (userId: string) => {
  const from = (table: string) => {
    if (table === "recipes") {
      let rows = [...RECIPES];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        maybeSingle: async () => {
          if (rows.length > 1) {
            return { data: null, error: { code: "PGRST116", message: "Wiele wierszy" } };
          }
          return { data: rows[0] ?? null, error: null };
        },
      };
      return query;
    }

    if (table === "diary_entries") {
      return {
        insert: (row: Row) => {
          const stored = { id: inserted.length + 1, ...row };
          inserted.push(stored);
          return { select: () => ({ single: async () => ({ data: stored, error: null }) }) };
        },
      };
    }

    throw new Error(`Atrapa nie zna tabeli ${table}`);
  };

  return {
    auth: { getUser: async () => ({ data: { user: { id: userId, email: `${userId}@example.com` } } }) },
    from,
  };
};

const requestContext = (body: unknown, userId = USER_B) =>
  ({
    request: new Request("http://localhost/api/diary-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: { supabase: createSupabase(userId) },
  }) as unknown as RouteContext;

const entryFromRecipe = (sourceRecipeId: number, extra: Row = {}) => ({
  entry_date: "2026-10-06",
  content: "Obiad z przepisu",
  source_recipe_id: sourceRecipeId,
  portions: 1,
  ...extra,
});

beforeEach(() => {
  inserted = [];
});

describe("POST /api/diary-entries - przepis innego użytkownika", () => {
  it("B z przepisem A dostaje 404 i wpis nie powstaje", async () => {
    // FK `source_recipe_id → recipes(id)` jest sprawdzany z pominięciem RLS, więc baza takiego
    // wpisu nie odrzuci. Broni wyłącznie odczyt własnego przepisu w serwisie.
    const response = await POST(requestContext(entryFromRecipe(10)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Przepis nie został znaleziony" });
    expect(inserted).toEqual([]);
  });

  it("odpowiedź na przepis A nie zdradza jego treści", async () => {
    const response = await POST(requestContext(entryFromRecipe(10)));

    // Bez statusu ta asercja nie mogłaby się zaczerwienić: trasa nigdy nie oddaje treści przepisu,
    // więc po usunięciu filtra `user_id` dałaby 201 bez „Tajny przepis A”.
    expect(response.status).toBe(404);
    await expect(response.text()).resolves.not.toContain("Tajny przepis A");
  });

  it("nieistniejący przepis daje ten sam 404 - cudzy i nieistniejący są nieodróżnialne", async () => {
    const foreign = await POST(requestContext(entryFromRecipe(10)));
    const missing = await POST(requestContext(entryFromRecipe(999)));

    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual(await foreign.json());
    expect(inserted).toEqual([]);
  });

  it("user_id A w ciele nie otwiera przepisu A - pole jest wycinane, wpis nie powstaje", async () => {
    // Schemat tworzenia wycina nieznane pola, więc trasa i tak działa jako B.
    const response = await POST(requestContext(entryFromRecipe(10, { user_id: USER_A })));

    expect(response.status).toBe(404);
    expect(inserted).toEqual([]);
  });

  it("własna wartość ręczna nie omija sprawdzenia przepisu", async () => {
    // Odczyt przepisu biegnie przed rozgałęzieniem kaskady - także gdy liczbę podano ręcznie.
    const response = await POST(requestContext(entryFromRecipe(10, { calories: 400 })));

    expect(response.status).toBe(404);
    expect(inserted).toEqual([]);
  });

  it("kontrola pozytywna: B z własnym przepisem dostaje 201, a insert idzie z user_id B", async () => {
    // Dowodzi, że atrapa nie odpowiada „nie ma” na wszystko - ten sam łańcuch znajduje przepis B.
    const response = await POST(requestContext(entryFromRecipe(20)));

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_B,
      source_recipe_id: 20,
      calories: 250,
      calorie_origin: "recipe_nutrition",
    });
  });
});

/** Wpis opisowy, poprawny poza polem, które nadpisuje przypadek. */
const describedEntry = (extra: Row = {}) => ({
  entry_date: "2026-10-06",
  content: "Owsianka z bananem",
  ...extra,
});

describe("POST /api/diary-entries - granice pól", () => {
  /**
   * Wyrocznia (literały źródłowe, nie schemat pod testem):
   * - `content` 500 znaków - `create_diary_entries.sql:33`;
   * - `amount_text` 100 znaków - `create_diary_entries.sql:35`;
   * - `calories` 0 - check migracji `calories >= 0`; 5000 - decyzja produktowa
   *   (`manual-diary-entry/reviews/plan-review.md`);
   * - `portions` 99 - decyzja produktowa, przy `numeric(6,2)` i `portions > 0`.
   * Wpis z porcjami musi wskazywać przepis, więc te przypadki idą z własnym przepisem B (20).
   */
  it.each<[string, Row]>([
    ["content 500 znaków", describedEntry({ content: "a".repeat(500) })],
    ["amount_text 100 znaków", describedEntry({ amount_text: "a".repeat(100) })],
    ["calories 0", describedEntry({ calories: 0 })],
    ["calories 5000", describedEntry({ calories: 5000 })],
    ["portions 99 z przepisem", entryFromRecipe(20, { portions: 99 })],
  ])("granica przechodzi: %s → 201 i jeden insert", async (_label, body) => {
    const response = await POST(requestContext(body));

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
  });

  /**
   * Wyrocznia jak wyżej, krok dalej za granicą; `source_recipe_id` 2147483648 - `recipes.id` to
   * `serial` (int4), największa wartość 2147483647. Każdy przypadek: 400, `details` wskazuje pole,
   * a do `diary_entries` nie poszedł żaden insert.
   */
  it.each<[string, Row, string]>([
    ["content 501 znaków", describedEntry({ content: "a".repeat(501) }), "content"],
    ["amount_text 101 znaków", describedEntry({ amount_text: "a".repeat(101) }), "amount_text"],
    ["calories -1", describedEntry({ calories: -1 }), "calories"],
    ["calories 5001", describedEntry({ calories: 5001 }), "calories"],
    ["portions 99.01 z przepisem", entryFromRecipe(20, { portions: 99.01 }), "portions"],
    ["portions 0 z przepisem", entryFromRecipe(20, { portions: 0 }), "portions"],
    ["source_recipe_id 2147483648", entryFromRecipe(2147483648), "source_recipe_id"],
  ])("krok dalej: %s → 400 z details przy polu i bez zapisu", async (_label, body, field) => {
    const response = await POST(requestContext(body));

    expect(response.status).toBe(400);
    const { details } = await response.json();
    expect(details).toEqual(expect.arrayContaining([{ path: field, message: expect.any(String) }]));
    expect(inserted).toEqual([]);
  });

  it("przyszła data 2999-01-01 → 201 (obecne zachowanie — luka zaakceptowana)", async () => {
    // Serwer nie ma reguły przyszłej daty: blokuje ją tylko przeglądarka, świadomie, żeby nie
    // rozstrzygać strefy czasowej użytkownika na serwerze (archiwum `manual-diary-entry`).
    // Luka jest opisana w `docs/reference/known-drift.md` („Wpisy dziennika”, wpis dodawany w fazie 5
    // planu `testing-protected-data-and-limits`). Gdy serwer dostanie regułę, ten test zrobi się
    // czerwony - wtedy zamień go na oczekiwanie 400 i usuń wpis z known-drift.
    const response = await POST(requestContext(describedEntry({ entry_date: "2999-01-01" })));

    expect(response.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ entry_date: "2999-01-01" });
  });
});
