import type { CreateDiaryEntryCommand, DiaryEntriesDto, DiaryEntryDto } from "../../types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../db/database.types";

/**
 * Serwis obsługujący wpisy dziennika posiłków.
 *
 * Konstruowany klientem Supabase z `context.locals.supabase` (jeden klient na żądanie),
 * dostaje dane już zwalidowane przez route i nie parsuje ich ponownie.
 */
export class DiaryService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * Pobiera wpisy użytkownika z jednego dnia
   * @param userId - ID użytkownika
   * @param entryDate - Dzień dziennika w formacie RRRR-MM-DD
   * @returns Lista wpisów wraz z liczbą wierszy
   */
  async getEntriesForDay(userId: string, entryDate: string): Promise<DiaryEntriesDto> {
    // Kolejność rosnąca: dziennik czyta się w kolejności, w jakiej posiłki się wydarzyły.
    // Drugi klucz nie jest ozdobą - `created_at` ma default `now()` (czas startu transakcji),
    // więc dwa wpisy potrafią mieć tę samą wartość, a Postgres nie dokłada własnego
    // rozstrzygnięcia. `id` jest monotoniczne, więc dopiero ono czyni porządek pełnym.
    const { data, error, count } = await this.supabase
      .from("diary_entries")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }

    return {
      data: data ?? [],
      total: count ?? 0,
    };
  }

  /**
   * Tworzy wpis dziennika
   * @param userId - ID użytkownika
   * @param command - Zwalidowane dane wpisu
   * @returns Utworzony wpis
   */
  async createEntry(userId: string, command: CreateDiaryEntryCommand): Promise<DiaryEntryDto> {
    // Pochodzenie wartości ustala serwer: liczba podana ręcznie to zawsze `manual`, a brak
    // liczby to brak pochodzenia. Baza pilnuje tej pary przez `diary_entries_value_has_origin`.
    // `estimation_requested_at` zostaje nietknięte - ten wpis nie zleca żadnego oszacowania.
    const { data, error } = await this.supabase
      .from("diary_entries")
      .insert({
        user_id: userId,
        entry_date: command.entry_date,
        content: command.content,
        amount_text: command.amount_text,
        calories: command.calories,
        calorie_origin: command.calories === null ? null : "manual",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Stempluje wpis znacznikiem zlecenia oszacowania.
   *
   * Zapis jest warunkowy - `.is("calories", null)` - bo wpis, który ma już wartość, nie czeka na
   * żaden model. Brak trafienia NIE jest tu błędem: rozstrzyga go dopiero odczyt wiersza.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @returns Faktyczny stan wiersza albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async markEstimationRequested(userId: string, entryId: number): Promise<DiaryEntryDto | null> {
    const now = new Date().toISOString();

    // `.maybeSingle()`, nigdy `.single()`: przy `.single()` zero trafionych wierszy nie daje
    // `data: null`, tylko błąd `PGRST116`, a `if (error) throw error` z `createEntry` wywaliłoby
    // dokładnie tę ścieżkę, dla której warunkowy zapis powstał.
    const { data: updated, error } = await this.supabase
      .from("diary_entries")
      .update({ estimation_requested_at: now, updated_at: now })
      .eq("id", entryId)
      .eq("user_id", userId)
      .is("calories", null)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (updated) {
      return updated;
    }

    // Brak trafienia zlewa trzy sytuacje: wpisu nie ma, należy do kogoś innego, albo ma już
    // wartość. Rozstrzyga je dopiero ten odczyt.
    return this.findEntry(userId, entryId);
  }

  /**
   * Dopisuje oszacowanie AI do wpisu, który wciąż nie ma wartości.
   *
   * `calorie_origin` ustawiane razem z `calories`, bo constraint `diary_entries_value_has_origin`
   * wymaga ich razem. Warunek `.is("calories", null)` chroni liczbę, którą użytkownik zdążył
   * wpisać ręcznie, zanim model odpowiedział - wyścig kończy się po stronie człowieka.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @param calories - Oszacowana wartość energetyczna
   * @returns Faktyczny stan wiersza albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async applyEstimate(userId: string, entryId: number, calories: number): Promise<DiaryEntryDto | null> {
    const { data: updated, error } = await this.supabase
      .from("diary_entries")
      .update({
        calories,
        calorie_origin: "ai_from_description",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .eq("user_id", userId)
      .is("calories", null)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (updated) {
      return updated;
    }

    return this.findEntry(userId, entryId);
  }

  /**
   * Ustawia wartość podaną ręcznie przez użytkownika.
   *
   * Zapis bezwarunkowy: człowiek nadpisuje oszacowanie, więc `.is("calories", null)` byłoby tu
   * błędem. `estimation_requested_at` zostaje nietknięte - wpisanie liczby nie unieważnia faktu,
   * że oszacowanie kiedyś zlecono.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @param calories - Wartość podana przez użytkownika
   * @returns Zaktualizowany wpis albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async setCaloriesManually(userId: string, entryId: number, calories: number): Promise<DiaryEntryDto | null> {
    const { data, error } = await this.supabase
      .from("diary_entries")
      .update({
        calories,
        calorie_origin: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      // Bez warunku na `calories` brak wiersza znaczy dokładnie jedno: nie ma takiego wpisu
      // u tego użytkownika. `.single()` zgłasza to kodem PGRST116, tak jak w `recipes/[id].ts`.
      if (error.code === "PGRST116") {
        return null;
      }

      throw error;
    }

    return data;
  }

  /**
   * Odczytuje wpis użytkownika po nieudanym zapisie warunkowym.
   *
   * Filtr po `user_id` mimo RLS: serwis nie zakłada, jaką rolą łączy się klient.
   */
  private async findEntry(userId: string, entryId: number): Promise<DiaryEntryDto | null> {
    const { data, error } = await this.supabase
      .from("diary_entries")
      .select("*")
      .eq("id", entryId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }
}
