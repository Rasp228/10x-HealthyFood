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
}
