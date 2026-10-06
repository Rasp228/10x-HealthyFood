/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `diary-entry-route.test.ts`.
 */

import { UserSettingsService } from "@/lib/services/user-settings.service";
import { GET, PUT } from "@/pages/api/user-settings";

/** `UserSettingsService` zostaje prawdziwy, podmieniane są wyłącznie jego metody. */
const getDailyGoal = jest.spyOn(UserSettingsService.prototype, "getDailyGoal");
const setDailyGoal = jest.spyOn(UserSettingsService.prototype, "setDailyGoal");

const getUser = jest.fn();

type RouteContext = Parameters<typeof PUT>[0];

/** Kontekst żądania w kształcie, którego trasa faktycznie dotyka. */
const getContext = () =>
  ({
    locals: { supabase: { auth: { getUser } } },
  }) as unknown as RouteContext;

const putContext = (body: unknown = { daily_calorie_goal: 2000 }, rawBody?: string) =>
  ({
    request: new Request("http://localhost/api/user-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    }),
    locals: { supabase: { auth: { getUser } } },
  }) as unknown as RouteContext;

beforeEach(() => {
  jest.clearAllMocks();

  getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "test@example.com" } } });
  getDailyGoal.mockResolvedValue(2000);
  setDailyGoal.mockImplementation(async (_userId, goal) => goal);
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("GET /api/user-settings", () => {
  it("401 bez sesji", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(getContext());

    expect(response.status).toBe(401);
    expect(getDailyGoal).not.toHaveBeenCalled();
  });

  it("200 z DailyGoalDto", async () => {
    const response = await GET(getContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ daily_calorie_goal: 2000 });
    expect(getDailyGoal).toHaveBeenCalledWith("user-1");
  });

  it("200 z null, gdy celu nie ustawiono", async () => {
    getDailyGoal.mockResolvedValue(null);

    const response = await GET(getContext());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ daily_calorie_goal: null });
  });

  it("500 bez szczegółów awarii", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    getDailyGoal.mockRejectedValue(new Error("permission denied for table user_settings"));

    const response = await GET(getContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera" });

    consoleError.mockRestore();
  });
});

describe("PUT /api/user-settings", () => {
  it("401 bez sesji", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await PUT(putContext());

    expect(response.status).toBe(401);
    expect(setDailyGoal).not.toHaveBeenCalled();
  });

  it("200 z DailyGoalDto po zapisie celu", async () => {
    const response = await PUT(putContext({ daily_calorie_goal: 1800 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ daily_calorie_goal: 1800 });
    expect(setDailyGoal).toHaveBeenCalledWith("user-1", 1800);
  });

  it("PUT null czyści cel", async () => {
    const response = await PUT(putContext({ daily_calorie_goal: null }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ daily_calorie_goal: null });
    expect(setDailyGoal).toHaveBeenCalledWith("user-1", null);
  });

  it("400 z details w kształcie ValidationIssue przy błędzie schematu", async () => {
    const response = await PUT(putContext({ daily_calorie_goal: 499 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [{ path: "daily_calorie_goal", message: "Cel nie może być niższy niż 500 kcal" }],
    });
    expect(setDailyGoal).not.toHaveBeenCalled();
  });

  it("400 przy braku klucza", async () => {
    const response = await PUT(putContext({}));

    expect(response.status).toBe(400);
    expect(setDailyGoal).not.toHaveBeenCalled();
  });

  it("400 na ciele, które nie jest JSON-em", async () => {
    const response = await PUT(putContext(undefined, "to nie json"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.details).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.any(String) })]));
    expect(setDailyGoal).not.toHaveBeenCalled();
  });

  it("500 bez szczegółów awarii", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    setDailyGoal.mockRejectedValue(new Error("violates check constraint user_settings_daily_calorie_goal_check"));

    const response = await PUT(putContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Błąd wewnętrzny serwera" });

    consoleError.mockRestore();
  });
});

describe("PUT /api/user-settings - granice celu", () => {
  // Wyrocznia: CHECK `daily_calorie_goal between 500 and 10000` z `create_user_settings.sql:27-28`
  // (literał migracji, nie wartość ze schematu pod testem).
  it.each([500, 10000])("cel %i na granicy → 200 i zapis", async (goal) => {
    const response = await PUT(putContext({ daily_calorie_goal: goal }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ daily_calorie_goal: goal });
    expect(setDailyGoal).toHaveBeenCalledWith("user-1", goal);
  });

  it.each([499, 10001])("cel %i za granicą → 400 z details przy polu, bez setDailyGoal", async (goal) => {
    const response = await PUT(putContext({ daily_calorie_goal: goal }));

    expect(response.status).toBe(400);
    const { details } = await response.json();
    expect(details).toEqual(expect.arrayContaining([{ path: "daily_calorie_goal", message: expect.any(String) }]));
    expect(setDailyGoal).not.toHaveBeenCalled();
  });
});
