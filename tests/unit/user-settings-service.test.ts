import { UserSettingsService } from "@/lib/services/user-settings.service";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMockErrorResponse,
  createMockSuccessResponse,
  mockSupabaseClient,
  resetSupabaseMocks,
} from "../mocks/supabase.mock";

const createService = () => new UserSettingsService(mockSupabaseClient as unknown as SupabaseClient<Database>);

beforeEach(() => {
  resetSupabaseMocks();
});

describe("UserSettingsService.getDailyGoal", () => {
  it("brak wiersza daje null, nie błąd", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValue(createMockSuccessResponse(null));

    await expect(createService().getDailyGoal("user-1")).resolves.toBeNull();
    expect(mockSupabaseClient.from).toHaveBeenCalledWith("user_settings");
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("wiersz bez celu daje null", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValue(createMockSuccessResponse({ daily_calorie_goal: null }));

    await expect(createService().getDailyGoal("user-1")).resolves.toBeNull();
  });

  it("zwraca zapisany cel", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValue(createMockSuccessResponse({ daily_calorie_goal: 2000 }));

    await expect(createService().getDailyGoal("user-1")).resolves.toBe(2000);
  });

  it("błąd Supabase rzuca Error", async () => {
    mockSupabaseClient.maybeSingle.mockResolvedValue(createMockErrorResponse("permission denied"));

    await expect(createService().getDailyGoal("user-1")).rejects.toThrow("permission denied");
  });
});

describe("UserSettingsService.setDailyGoal", () => {
  it("wywołuje upsert z user_id, celem i jawnym updated_at, po konflikcie na user_id", async () => {
    mockSupabaseClient.single.mockResolvedValue(createMockSuccessResponse({ daily_calorie_goal: 1800 }));

    await expect(createService().setDailyGoal("user-1", 1800)).resolves.toBe(1800);
    expect(mockSupabaseClient.from).toHaveBeenCalledWith("user_settings");
    expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", daily_calorie_goal: 1800, updated_at: expect.any(String) },
      { onConflict: "user_id" }
    );
  });

  it("null czyści cel", async () => {
    mockSupabaseClient.single.mockResolvedValue(createMockSuccessResponse({ daily_calorie_goal: null }));

    await expect(createService().setDailyGoal("user-1", null)).resolves.toBeNull();
    expect(mockSupabaseClient.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", daily_calorie_goal: null }),
      { onConflict: "user_id" }
    );
  });

  it("błąd Supabase rzuca Error", async () => {
    mockSupabaseClient.single.mockResolvedValue(createMockErrorResponse("violates check constraint"));

    await expect(createService().setDailyGoal("user-1", 2000)).rejects.toThrow("violates check constraint");
  });
});
