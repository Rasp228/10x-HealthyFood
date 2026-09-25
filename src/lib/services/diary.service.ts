import type { CalorieOriginEnum, CreateDiaryEntryCommand, DiaryEntriesDto, DiaryEntryDto } from "../../types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../db/database.types";
import { resolveRecipeCalories } from "../utils/recipe-nutrition";

/**
 * Wskazany przepis nie istnieje albo należy do kogoś innego.
 *
 * Typowana klasa, nie gołe `Error`: trasa musi umieć odróżnić ten jeden przypadek od awarii bazy
 * i oddać 404 zamiast 500. Idiom jak w `src/lib/api/openrouter.types.ts`.
 */
export class RecipeNotFoundError extends Error {
  constructor(message = "Przepis nie został znaleziony") {
    super(message);
    this.name = "RecipeNotFoundError";
  }
}

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
   * @throws RecipeNotFoundError - gdy wskazany przepis nie istnieje albo należy do kogoś innego
   */
  async createEntry(userId: string, command: CreateDiaryEntryCommand): Promise<DiaryEntryDto> {
    const recipeContent = await this.readOwnRecipeContent(userId, command.source_recipe_id);

    // Pochodzenie wartości ustala serwer: liczba podana ręcznie to zawsze `manual`, a brak
    // liczby to brak pochodzenia. Baza pilnuje tej pary przez `diary_entries_value_has_origin`.
    // `estimation_requested_at` zostaje nietknięte - ten wpis nie zleca żadnego oszacowania.
    let calories = command.calories;
    let calorieOrigin: CalorieOriginEnum | null = command.calories === null ? null : "manual";

    // Wartość ręczna wygrywa z przepisem (FR-004) - wtedy treści z kroku wyżej w ogóle nie
    // czytamy. Dla wpisu z przepisu liczy ją parser: brak rozpoznanego bloku zostawia oba pola
    // `null`, bo `diary_entries_value_has_origin` nie pozwala zapisać jednego bez drugiego.
    if (command.calories === null && recipeContent !== null && command.portions !== null) {
      const { total } = resolveRecipeCalories(recipeContent, command.portions);

      calories = total;
      calorieOrigin = total === null ? null : "recipe_nutrition";
    }

    const { data, error } = await this.supabase
      .from("diary_entries")
      .insert({
        user_id: userId,
        entry_date: command.entry_date,
        content: command.content,
        amount_text: command.amount_text,
        calories,
        calorie_origin: calorieOrigin,
        source_recipe_id: command.source_recipe_id,
        portions: command.portions,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Treść przepisu należącego do tego użytkownika albo `null`, gdy wpis nie pochodzi z przepisu.
   *
   * Odczyt biegnie **przed** rozgałęzieniem kaskady, także dla wpisu z wartością ręczną. Klucz obcy
   * wskazuje `recipes(id)` bez predykatu właściciela, a RLS na `diary_entries` pilnuje wyłącznie
   * `user_id`, więc bez tego kroku `POST` z własną liczbą i cudzym `source_recipe_id` zapisałby
   * wiersz wskazujący przepis, którego autor wpisu nie może przeczytać.
   *
   * Filtr po `user_id` mimo RLS - tak samo jak w `getEntry`: serwis nie zakłada roli klienta.
   *
   * Publiczna, bo drugim wywołującym jest trasa wyceny kalorii: potrzebuje treści przepisu, żeby
   * policzyć wartość jednej porcji. Rzut `RecipeNotFoundError` znaczy tam co innego niż przy
   * zapisie wpisu - wpis istnieje, brakuje tylko przepisu, więc trasa schodzi na gałąź opisową
   * zamiast oddać 404.
   */
  async readOwnRecipeContent(userId: string, recipeId: number | null): Promise<string | null> {
    if (recipeId === null) {
      return null;
    }

    const { data: recipe, error } = await this.supabase
      .from("recipes")
      .select("content")
      .eq("id", recipeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!recipe) {
      throw new RecipeNotFoundError();
    }

    return recipe.content;
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
    return this.getEntry(userId, entryId);
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
   * @param origin - Pochodzenie wartości, ustalone przez trasę w tej samej gałęzi, która ją
   *   policzyła. Typ zawężony do dwóch oszacowań AI: `manual` i `recipe_nutrition` mają własne,
   *   bezwarunkowe ścieżki zapisu (`setCaloriesManually`, `createEntry`), a bez zawężenia tą
   *   metodą dałoby się zapisać `manual` na wpisie, którego użytkownik nie tknął.
   * @returns Faktyczny stan wiersza albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async applyEstimate(
    userId: string,
    entryId: number,
    calories: number,
    origin: Extract<CalorieOriginEnum, "ai_from_description" | "ai_from_recipe">
  ): Promise<DiaryEntryDto | null> {
    const { data: updated, error } = await this.supabase
      .from("diary_entries")
      .update({
        calories,
        calorie_origin: origin,
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

    return this.getEntry(userId, entryId);
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
   * Odczytuje pojedynczy wpis użytkownika. `null` oznacza "nie ma takiego wpisu u tego
   * użytkownika" i zamienia się w trasie na 404.
   *
   * Publiczna, bo woła ją nie tylko zapis warunkowy: trasa wyceny potrzebuje jej, żeby po
   * powrocie modelu bez liczby oddać wiersz w stanie FAKTYCZNYM, a nie kopię sprzed wywołania.
   * Między stemplem a odpowiedzią mija do 55 s i użytkownik mógł w tym czasie zapisać wartość
   * ręcznie - kopia sprzed wywołania raportowałaby wtedy `calories: null` wbrew bazie.
   *
   * Filtr po `user_id` mimo RLS: serwis nie zakłada, jaką rolą łączy się klient.
   */
  async getEntry(userId: string, entryId: number): Promise<DiaryEntryDto | null> {
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
