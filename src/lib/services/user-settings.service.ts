import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../db/database.types";

/**
 * Serwis obsługujący ustawienia użytkownika - na razie wyłącznie dzienny cel kaloryczny.
 *
 * Konstruowany klientem Supabase z `context.locals.supabase` (jeden klient na żądanie),
 * dostaje dane już zwalidowane przez route i nie parsuje ich ponownie.
 */
export class UserSettingsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * Odczytuje dzienny cel użytkownika.
   *
   * `.maybeSingle()`, nie `.single()`: użytkownik, który nigdy nie ustawił celu, nie ma wiersza,
   * a `.single()` zamieniłoby ten zwykły stan w błąd `PGRST116`.
   *
   * @param userId - ID użytkownika
   * @returns Cel w kcal albo `null`, gdy celu nie ustawiono (także gdy wiersza nie ma)
   */
  async getDailyGoal(userId: string): Promise<number | null> {
    const { data, error } = await this.supabase
      .from("user_settings")
      .select("daily_calorie_goal")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data?.daily_calorie_goal ?? null;
  }

  /**
   * Ustawia albo czyści (`null`) dzienny cel użytkownika.
   *
   * `upsert` po `user_id`, bo wiersz powstaje dopiero przy pierwszym zapisie. `updated_at`
   * podajemy jawnie - przy konflikcie upsert robi UPDATE, a default kolumny działa tylko przy
   * INSERT.
   *
   * @param userId - ID użytkownika
   * @param goal - Zwalidowany cel w kcal albo `null`
   * @returns Cel w stanie zapisanym w bazie
   */
  async setDailyGoal(userId: string, goal: number | null): Promise<number | null> {
    const { data, error } = await this.supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, daily_calorie_goal: goal, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      )
      .select("daily_calorie_goal")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data.daily_calorie_goal;
  }
}
