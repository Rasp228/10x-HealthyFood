/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-estimate-route.test.ts`.
 */

import { DiaryService, EntryShapeError } from "@/lib/services/diary.service";
import { DELETE, PATCH } from "@/pages/api/diary-entries/[id]";
import type { DiaryEntryDto } from "@/types";

/**
 * `DiaryService` zostaje prawdziwy, a podmieniane są wyłącznie jego metody - dzięki temu
 * `EntryShapeError` łapany w trasie jest tą samą klasą, którą serwis rzuca w produkcji.
 */
const updateEntry = jest.spyOn(DiaryService.prototype, "updateEntry");
const deleteEntry = jest.spyOn(DiaryService.prototype, "deleteEntry");

const getUser = jest.fn();

type RouteContext = Parameters<typeof PATCH>[0];

/** Kontekst żądania w kształcie, którego trasa faktycznie dotyka. */
const requestContext = (id = "1", body: unknown = { calories: 450 }, rawBody?: string) =>
  ({
    params: { id },
    request: new Request(`http://localhost/api/diary-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    }),
    locals: { supabase: { auth: { getUser } } },
  }) as unknown as RouteContext;

const deleteContext = (id = "1") =>
  ({
    params: { id },
    locals: { supabase: { auth: { getUser } } },
  }) as unknown as RouteContext;

const storedEntry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto => ({
  id: 1,
  user_id: "user-1",
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: null,
  calories: null,
  calorie_origin: null,
  estimation_requested_at: null,
  portions: null,
  source_recipe_id: null,
  created_at: "2026-09-23T07:00:00.000Z",
  updated_at: "2026-09-23T08:00:00.000Z",
  ...overrides,
});

/**
 * Wiersz, który oddaje atrapa serwisu - stały, niezależny od polecenia.
 *
 * Atrapa nie wylicza pochodzenia z ciała żądania: wtedy test trasy sprawdzałby własną atrapę,
 * a nie trasę. Że `{calories: N}` daje `manual`, dowodzi test `updateEntry` w
 * `diary-service.test.ts`. Tu sprawdzamy wyłącznie to, za co odpowiada trasa.
 */
const SERVICE_ROW = storedEntry({ calories: 450, calorie_origin: "manual" });

beforeEach(() => {
  jest.clearAllMocks();

  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  updateEntry.mockResolvedValue(SERVICE_ROW);
  deleteEntry.mockResolvedValue(true);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("PATCH /api/diary-entries/[id]", () => {
  it("401 bez sesji", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(requestContext());

    expect(response.status).toBe(401);
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("400 na nieprawidłowym identyfikatorze", async () => {
    const response = await PATCH(requestContext("12abc"));

    expect(response.status).toBe(400);
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("{calories: N} przekazuje polecenie serwisowi i oddaje jego wiersz bez zmian", async () => {
    const response = await PATCH(requestContext("1", { calories: 450 }));

    expect(response.status).toBe(200);
    expect(updateEntry).toHaveBeenCalledWith("user-1", 1, { calories: 450 });
    await expect(response.json()).resolves.toEqual(SERVICE_ROW);
  });

  it("400 z details w kształcie ValidationIssue przy błędzie schematu", async () => {
    const response = await PATCH(requestContext("1", { source_recipe_id: 7 }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.any(String) })]));
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("400 na ciele, które nie jest JSON-em", async () => {
    const response = await PATCH(requestContext("1", undefined, "to nie json"));

    expect(response.status).toBe(400);
  });

  it("400 z path pola przy EntryShapeError", async () => {
    updateEntry.mockRejectedValue(
      new EntryShapeError("portions", "Liczbę porcji można zmienić tylko we wpisie, który ją ma")
    );

    const response = await PATCH(requestContext("1", { portions: 2 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [{ path: "portions", message: "Liczbę porcji można zmienić tylko we wpisie, który ją ma" }],
    });
  });

  it("404 dla cudzego albo nieistniejącego wpisu", async () => {
    updateEntry.mockResolvedValue(null);

    const response = await PATCH(requestContext("999"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Wpis nie został znaleziony" });
  });

  it("500 bez szczegółów awarii", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    updateEntry.mockRejectedValue(new Error('violates check constraint "diary_entries_value_has_origin"'));

    const response = await PATCH(requestContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera" });

    consoleError.mockRestore();
  });
});

describe("DELETE /api/diary-entries/[id]", () => {
  it("401 bez sesji", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(401);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("400 na nieprawidłowym identyfikatorze", async () => {
    const response = await DELETE(deleteContext("0"));

    expect(response.status).toBe(400);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("204 bez ciała po usunięciu", async () => {
    const response = await DELETE(deleteContext("1"));

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    expect(deleteEntry).toHaveBeenCalledWith("user-1", 1);
  });

  it("404 dla cudzego albo nieistniejącego wpisu", async () => {
    deleteEntry.mockResolvedValue(false);

    const response = await DELETE(deleteContext("999"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Wpis nie został znaleziony" });
  });

  it("500 bez szczegółów awarii", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    deleteEntry.mockRejectedValue(new Error("RLS odrzuciło zapis"));

    const response = await DELETE(deleteContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera" });

    consoleError.mockRestore();
  });
});

describe("PATCH /api/diary-entries/[id] - granice pól i identyfikatora", () => {
  /**
   * Wyrocznia (literały źródłowe, nie schemat pod testem):
   * - `content` 500 znaków - `create_diary_entries.sql:33`;
   * - `calories` 5000 - decyzja produktowa (`manual-diary-entry/reviews/plan-review.md`);
   * - `portions` 99 - decyzja produktowa.
   * Krok dalej daje 400 z `details` przy polu, a serwis nie jest wołany - nic nie trafia do bazy.
   */
  it.each<[string, Record<string, unknown>, string]>([
    ["content 501 znaków", { content: "a".repeat(501) }, "content"],
    ["calories 5001", { calories: 5001 }, "calories"],
    ["portions 99.01", { portions: 99.01 }, "portions"],
  ])("krok dalej: %s → 400 bez wywołania serwisu", async (_label, body, field) => {
    const response = await PATCH(requestContext("1", body));

    expect(response.status).toBe(400);
    const { details } = await response.json();
    expect(details).toEqual(expect.arrayContaining([{ path: field, message: expect.any(String) }]));
    expect(updateEntry).not.toHaveBeenCalled();
  });

  // Wyrocznia: `diary_entries.id` to `serial` (int4), największy wiersz ma 2147483647.
  it("granica identyfikatora 2147483647 dociera do serwisu", async () => {
    const response = await PATCH(requestContext("2147483647"));

    expect(response.status).toBe(200);
    expect(updateEntry).toHaveBeenCalledWith("user-1", 2147483647, { calories: 450 });
  });

  it("identyfikator 2147483648 → 400 bez wywołania serwisu", async () => {
    const response = await PATCH(requestContext("2147483648"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [{ path: "", message: "Nieprawidłowy identyfikator wpisu" }],
    });
    expect(updateEntry).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/diary-entries/[id] - granica identyfikatora", () => {
  // Wyrocznia: `diary_entries.id` to `serial` (int4), największy wiersz ma 2147483647.
  it("granica identyfikatora 2147483647 dociera do serwisu", async () => {
    const response = await DELETE(deleteContext("2147483647"));

    expect(response.status).toBe(204);
    expect(deleteEntry).toHaveBeenCalledWith("user-1", 2147483647);
  });

  it("identyfikator 2147483648 → 400 bez wywołania serwisu", async () => {
    const response = await DELETE(deleteContext("2147483648"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [{ path: "", message: "Nieprawidłowy identyfikator wpisu" }],
    });
    expect(deleteEntry).not.toHaveBeenCalled();
  });
});
