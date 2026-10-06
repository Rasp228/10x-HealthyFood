/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasy budują `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 *
 * Ryzyko #5 test-planu: zapis celu dziennego i każda operacja w dzienniku zostawiają preferencje
 * i przepisy nietknięte, a usunięcie jednej preferencji nie rusza pozostałych. Dowodem jest stan
 * tabel po operacji (głęboka równość z migawką sprzed niej), nie status HTTP.
 *
 * Trasy i serwisy są prawdziwe; podmieniona jest tylko warstwa bazy (`tests/helpers/supabase-tables.ts`)
 * i - dla trasy wyceny - krawędź dostawcy modelu. Każdy przypadek ma też kontrolę pozytywną: tabela
 * docelowa faktycznie się zmieniła. Bez niej zielony test przeszedłby także dla atrapy, która
 * niczego nie zapisuje.
 */

import type { APIContext } from "astro";
import { CalorieEstimationService } from "@/lib/services/calorie-estimation.service";
import { PUT as putUserSettings } from "@/pages/api/user-settings/index";
import { POST as postDiaryEntry } from "@/pages/api/diary-entries/index";
import { PATCH as patchDiaryEntry, DELETE as deleteDiaryEntry } from "@/pages/api/diary-entries/[id]";
import { POST as postEstimate } from "@/pages/api/diary-entries/[id]/estimate";
import { DELETE as deletePreference } from "@/pages/api/preferences/[id]";
import { DELETE as deleteRecipe } from "@/pages/api/recipes/[id]";
import { createSupabaseTables, type Row, type TableState } from "../helpers/supabase-tables";

/**
 * Serwis modelu zamockowany w całości, jak w `diary-estimate-route.test.ts`: suita nie płaci za
 * wywołania dostawcy, a moduł czyta `import.meta.env`, czego ts-jest (CommonJS) nie skompiluje.
 * Fabryka nie sięga po nic spoza siebie, bo `jest.mock` jest wynoszony ponad importy.
 */
jest.mock("@/lib/services/calorie-estimation.service", () => ({
  CalorieEstimationService: jest.fn(),
}));

const CalorieEstimationServiceMock = CalorieEstimationService as unknown as jest.Mock;
const estimateFromDescription = jest.fn();
const estimateFromRecipe = jest.fn();

const USER_A = "user-a";
const USER_B = "user-b";

/** Przepis A z blokiem deklarującym jedną porcję - prawdziwy parser odczyta z niego 250 kcal. */
const RECIPE_WITH_BLOCK = [
  "Składniki:",
  "- 60 g płatków owsianych",
  "- 1 banan",
  "",
  "Wartości odżywcze na porcję:",
  "Kalorie: 250 kcal",
  "Białko: 9 g",
].join("\n");

/** Przepis A bez bloku odżywczego - wartość może dać tylko wycena z treści. */
const RECIPE_WITHOUT_BLOCK = "Składniki:\n- 200 g ciecierzycy\n- 1 ogórek\n\nPrzygotowanie:\n1. Wymieszaj";

/**
 * Wiersze dwóch użytkowników w każdej tabeli. A ma trzy preferencje, w tym dwie w kategorii
 * `lubiane`, oraz dwa przepisy, w tym jeden z blokiem „Wartości odżywcze na porcję”. A nie ma
 * jeszcze wiersza `user_settings` - pierwszy zapis celu go tworzy.
 */
const seed = (): TableState => ({
  preferences: [
    { id: 1, user_id: USER_A, category: "lubiane", value: "owsianka", created_at: "2026-09-01T08:00:00.000Z" },
    { id: 2, user_id: USER_A, category: "lubiane", value: "banany", created_at: "2026-09-01T08:01:00.000Z" },
    { id: 3, user_id: USER_A, category: "wykluczone", value: "orzechy", created_at: "2026-09-01T08:02:00.000Z" },
    { id: 4, user_id: USER_B, category: "lubiane", value: "owsianka", created_at: "2026-09-02T08:00:00.000Z" },
    { id: 5, user_id: USER_B, category: "diety", value: "wegetariańska", created_at: "2026-09-02T08:01:00.000Z" },
  ],
  recipes: [
    {
      id: 10,
      user_id: USER_A,
      title: "Owsianka z bananem",
      content: RECIPE_WITH_BLOCK,
      additional_params: null,
      is_ai_generated: false,
      created_at: "2026-09-03T08:00:00.000Z",
      updated_at: "2026-09-03T08:00:00.000Z",
    },
    {
      id: 11,
      user_id: USER_A,
      title: "Sałatka z ciecierzycą",
      content: RECIPE_WITHOUT_BLOCK,
      additional_params: "szybkie",
      is_ai_generated: true,
      created_at: "2026-09-03T09:00:00.000Z",
      updated_at: "2026-09-04T09:00:00.000Z",
    },
    {
      id: 20,
      user_id: USER_B,
      title: "Jajecznica",
      content: "Składniki:\n- 3 jajka",
      additional_params: null,
      is_ai_generated: false,
      created_at: "2026-09-03T10:00:00.000Z",
      updated_at: "2026-09-03T10:00:00.000Z",
    },
  ],
  diary_entries: [
    {
      id: 100,
      user_id: USER_A,
      entry_date: "2026-10-01",
      content: "Kanapka z serem",
      amount_text: "2 kromki",
      calories: 350,
      calorie_origin: "manual",
      estimation_requested_at: null,
      portions: null,
      source_recipe_id: null,
      created_at: "2026-10-01T07:00:00.000Z",
      updated_at: "2026-10-01T07:00:00.000Z",
    },
    {
      // Wpis z przepisu 10, którego wartość użytkownik nadpisał ręcznie.
      id: 101,
      user_id: USER_A,
      entry_date: "2026-10-01",
      content: "Owsianka z bananem",
      amount_text: null,
      calories: 450,
      calorie_origin: "manual",
      estimation_requested_at: null,
      portions: 2,
      source_recipe_id: 10,
      created_at: "2026-10-01T08:00:00.000Z",
      updated_at: "2026-10-01T08:00:00.000Z",
    },
    {
      // Wpis z przepisu 11 (bez bloku), jeszcze bez wartości - czeka na wycenę.
      id: 102,
      user_id: USER_A,
      entry_date: "2026-10-01",
      content: "Sałatka z ciecierzycą",
      amount_text: null,
      calories: null,
      calorie_origin: null,
      estimation_requested_at: null,
      portions: 2,
      source_recipe_id: 11,
      created_at: "2026-10-01T12:00:00.000Z",
      updated_at: "2026-10-01T12:00:00.000Z",
    },
    {
      id: 200,
      user_id: USER_B,
      entry_date: "2026-10-01",
      content: "Jajecznica",
      amount_text: "3 jajka",
      calories: 300,
      calorie_origin: "manual",
      estimation_requested_at: null,
      portions: null,
      source_recipe_id: null,
      created_at: "2026-10-01T07:30:00.000Z",
      updated_at: "2026-10-01T07:30:00.000Z",
    },
  ],
  user_settings: [
    {
      user_id: USER_B,
      daily_calorie_goal: 1800,
      created_at: "2026-09-05T08:00:00.000Z",
      updated_at: "2026-09-05T08:00:00.000Z",
    },
  ],
});

/** Odwzorowanie `preferences_unique_user_category_value` z `20250427130913_healthymeal_schema.sql`. */
const UNIQUE = { preferences: [["user_id", "category", "value"]] };

const createDb = () => createSupabaseTables({ userId: USER_A, tables: seed(), unique: UNIQUE });

type Db = ReturnType<typeof createDb>;

/** Kontekst żądania w kształcie, którego trasy dotykają: `request`, `params`, `url` i klient z `locals`. */
const context = (db: Db, init: { method: string; body?: unknown; params?: Record<string, string> }) =>
  ({
    request: new Request("http://localhost/api/test", {
      method: init.method,
      headers: { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
    params: init.params ?? {},
    url: new URL("http://localhost/api/test"),
    locals: { supabase: db.supabase },
  }) as unknown as APIContext;

/**
 * Tabele głęboko równe migawce sprzed operacji. Owinięte w obiekt z nazwą tabeli, żeby różnica
 * w raporcie Jest mówiła, która tabela się zmieniła.
 */
const expectUntouched = (before: TableState, after: TableState, names: string[]) => {
  for (const name of names) {
    expect({ [name]: after[name] }).toEqual({ [name]: before[name] });
  }
};

const rowById = (state: TableState, table: string, id: number): Row | undefined =>
  state[table].find((row) => row.id === id);

/** Wiersze tabeli bez wskazanych identyfikatorów - reszta tabeli docelowej ma zostać bez zmian. */
const withoutIds = (state: TableState, table: string, ids: number[]): Row[] =>
  state[table].filter((row) => !ids.includes(row.id as number));

beforeEach(() => {
  jest.clearAllMocks();
  CalorieEstimationServiceMock.mockImplementation(() => ({ estimateFromDescription, estimateFromRecipe }));
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("PUT /api/user-settings - cel dzienny nie dotyka preferencji ani przepisów", () => {
  it("ustawienie 2000, a potem wyczyszczenie celu zmienia tylko user_settings", async () => {
    const db = createDb();
    const before = db.snapshot();

    const set = await putUserSettings(context(db, { method: "PUT", body: { daily_calorie_goal: 2000 } }));

    expect(set.status).toBe(200);
    const afterSet = db.snapshot();
    expectUntouched(before, afterSet, ["preferences", "recipes", "diary_entries"]);
    // Kontrola pozytywna: wiersz A powstał z celem 2000, wiersz B bez zmian.
    expect(afterSet.user_settings).toEqual([
      before.user_settings[0],
      { user_id: USER_A, daily_calorie_goal: 2000, updated_at: expect.any(String) },
    ]);

    const cleared = await putUserSettings(context(db, { method: "PUT", body: { daily_calorie_goal: null } }));

    expect(cleared.status).toBe(200);
    const afterClear = db.snapshot();
    expectUntouched(before, afterClear, ["preferences", "recipes", "diary_entries"]);
    expect(afterClear.user_settings).toEqual([
      before.user_settings[0],
      { user_id: USER_A, daily_calorie_goal: null, updated_at: expect.any(String) },
    ]);
  });
});

describe("POST /api/diary-entries - nowy wpis nie dotyka preferencji ani przepisów", () => {
  it("wpis opisowy z ręczną wartością", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postDiaryEntry(
      context(db, {
        method: "POST",
        body: { entry_date: "2026-10-02", content: "Jogurt naturalny", amount_text: "150 g", calories: 120 },
      })
    );

    expect(response.status).toBe(201);
    const after = db.snapshot();
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    // Kontrola pozytywna: dokładnie jeden nowy wiersz, istniejące bez zmian.
    expect(after.diary_entries).toHaveLength(before.diary_entries.length + 1);
    expect(after.diary_entries.slice(0, -1)).toEqual(before.diary_entries);
    expect(after.diary_entries.at(-1)).toMatchObject({
      user_id: USER_A,
      content: "Jogurt naturalny",
      calories: 120,
      calorie_origin: "manual",
    });
  });

  it("wpis z przepisu z porcjami - parser liczy wartość, a przepis zostaje bez zmian, także updated_at", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await postDiaryEntry(
      context(db, {
        method: "POST",
        body: { entry_date: "2026-10-02", content: "Owsianka z bananem", source_recipe_id: 10, portions: 2 },
      })
    );

    expect(response.status).toBe(201);
    const after = db.snapshot();
    // Przepis odczytany, nie zapisany: cała tabela `recipes` - z `updated_at` przepisu 10 - jak przed.
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(after.diary_entries.slice(0, -1)).toEqual(before.diary_entries);
    // Wyrocznia: blok „na porcję” deklaruje 250 kcal, zjedzone 2 porcje → 500 kcal.
    expect(after.diary_entries.at(-1)).toMatchObject({
      user_id: USER_A,
      source_recipe_id: 10,
      portions: 2,
      calories: 500,
      calorie_origin: "recipe_nutrition",
    });
  });
});

describe("PATCH /api/diary-entries/:id - edycja wpisu nie dotyka preferencji ani przepisów", () => {
  it("zmiana calories", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await patchDiaryEntry(
      context(db, { method: "PATCH", params: { id: "100" }, body: { calories: 400 } })
    );

    expect(response.status).toBe(200);
    const after = db.snapshot();
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(withoutIds(after, "diary_entries", [100])).toEqual(withoutIds(before, "diary_entries", [100]));
    expect(rowById(after, "diary_entries", 100)).toMatchObject({ calories: 400, calorie_origin: "manual" });
  });

  it("recalculate: true na wpisie z przepisu", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await patchDiaryEntry(
      context(db, { method: "PATCH", params: { id: "101" }, body: { recalculate: true } })
    );

    expect(response.status).toBe(200);
    const after = db.snapshot();
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(withoutIds(after, "diary_entries", [101])).toEqual(withoutIds(before, "diary_entries", [101]));
    // Wyrocznia: 250 kcal z bloku razy 2 porcje = 500, w miejsce ręcznych 450.
    expect(rowById(after, "diary_entries", 101)).toMatchObject({
      calories: 500,
      calorie_origin: "recipe_nutrition",
      estimation_requested_at: null,
    });
  });

  it("zmiana portions", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await patchDiaryEntry(
      context(db, { method: "PATCH", params: { id: "101" }, body: { portions: 3 } })
    );

    expect(response.status).toBe(200);
    const after = db.snapshot();
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(withoutIds(after, "diary_entries", [101])).toEqual(withoutIds(before, "diary_entries", [101]));
    // Ręczna wartość stoi, dopóki użytkownik jej nie dotknie - zmieniają się tylko porcje.
    expect(rowById(after, "diary_entries", 101)).toMatchObject({
      portions: 3,
      calories: 450,
      calorie_origin: "manual",
    });
  });
});

describe("DELETE /api/diary-entries/:id - usunięcie wpisu nie dotyka preferencji ani przepisów", () => {
  it("usuwa tylko wskazany wpis", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await deleteDiaryEntry(context(db, { method: "DELETE", params: { id: "101" } }));

    expect(response.status).toBe(204);
    const after = db.snapshot();
    // Wpis 101 pochodził z przepisu 10 - przepis i tak ma zostać nietknięty.
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(after.diary_entries).toEqual(withoutIds(before, "diary_entries", [101]));
  });
});

describe("POST /api/diary-entries/:id/estimate - wycena nie dotyka preferencji ani przepisów", () => {
  it("wpis z przepisu dostaje wartość, przepis zostaje bez zmian", async () => {
    estimateFromRecipe.mockResolvedValue(300);
    const db = createDb();
    const before = db.snapshot();

    const response = await postEstimate(context(db, { method: "POST", params: { id: "102" } }));

    expect(response.status).toBe(200);
    expect(estimateFromRecipe).toHaveBeenCalledWith(RECIPE_WITHOUT_BLOCK, "Sałatka z ciecierzycą");
    const after = db.snapshot();
    expectUntouched(before, after, ["preferences", "recipes", "user_settings"]);
    expect(withoutIds(after, "diary_entries", [102])).toEqual(withoutIds(before, "diary_entries", [102]));
    // Wyrocznia: model podał 300 kcal na porcję, wpis ma 2 porcje → 600.
    expect(rowById(after, "diary_entries", 102)).toMatchObject({
      calories: 600,
      calorie_origin: "ai_from_recipe",
      estimation_requested_at: expect.any(String),
    });
  });
});

describe("DELETE /api/preferences/:id - usunięcie jednej preferencji nie rusza pozostałych", () => {
  it("DELETE jednej preferencji z dwóch w tej samej kategorii", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await deletePreference(context(db, { method: "DELETE", params: { id: "2" } }));

    expect(response.status).toBe(204);
    const after = db.snapshot();
    // Pozostałe preferencje A (także druga `lubiane`) i wszystkie B są co do pola nietknięte,
    // a usunięta zniknęła. Sam filtr po `user_id` nie wystarczy - A ma tu jeszcze dwie preferencje.
    expect(after.preferences).toEqual(withoutIds(before, "preferences", [2]));
    expect(rowById(after, "preferences", 2)).toBeUndefined();
    expectUntouched(before, after, ["recipes", "diary_entries", "user_settings"]);
  });
});

describe("DELETE /api/recipes/:id - usunięcie przepisu w kodzie nie dotyka wpisów ani preferencji", () => {
  it("usuwa tylko przepis; diary_entries i preferences są nietknięte w atrapie", async () => {
    const db = createDb();
    const before = db.snapshot();

    const response = await deleteRecipe(context(db, { method: "DELETE", params: { id: "10" } }));

    expect(response.status).toBe(200);
    const after = db.snapshot();
    expect(after.recipes).toEqual(withoutIds(before, "recipes", [10]));
    // Ten test dowodzi tylko tego, że KOD trasy nie pisze do `diary_entries` ani `preferences`.
    // Zachowanie wpisów po usunięciu przepisu (`on delete set null` na `source_recipe_id` -
    // wpis 101 zostaje z wartością, a traci odwołanie) zapewnia baza, a atrapa celowo go nie
    // udaje. Tutaj wpis 101 zachowuje `source_recipe_id: 10`, czego prawdziwa baza by nie zrobiła.
    expectUntouched(before, after, ["diary_entries", "preferences", "user_settings"]);
  });
});
