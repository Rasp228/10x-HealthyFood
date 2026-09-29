import type {
  CalorieOriginEnum,
  CreateDiaryEntryCommand,
  DiaryEntriesDto,
  DiaryEntryDto,
  UpdateDiaryEntryCommand,
} from "../../types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TablesUpdate } from "../../db/database.types";
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
 * Pole ilości nie pasuje do kształtu zapisanego wiersza: porcje przyszły do wpisu opisowego albo
 * tekst ilości do wpisu z porcjami.
 *
 * Typowana klasa z `path`, bo reguła zależy od wiersza w bazie, a nie od ciała żądania - schemat
 * Zod jej nie widzi. Trasa zamienia ten błąd na 400 w kształcie `ValidationIssue`, więc formularz
 * pokaże go przy polu, którego dotyczy. Idiom jak `RecipeNotFoundError`.
 */
export class EntryShapeError extends Error {
  constructor(
    readonly path: "portions" | "amount_text",
    message: string
  ) {
    super(message);
    this.name = "EntryShapeError";
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
   * Drugi warunek - znacznik równy temu, który zapisało to samo żądanie - chroni wpis, który
   * zmienił się w trakcie wyceny. Anulowanie w przeglądarce nie zatrzymuje trasy, więc bez niego
   * wycena treści sprzed edycji albo sprzed "Zapisz i przelicz" wylądowałaby na wierszu, który
   * `updateEntry` już wyzerował. Każdy zapis, który unieważnia wycenę, zeruje znacznik, a nowe
   * zlecenie nadpisuje go własnym - wygrywa więc tylko najnowsze zlecenie.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @param calories - Oszacowana wartość energetyczna
   * @param origin - Pochodzenie wartości, ustalone przez trasę w tej samej gałęzi, która ją
   *   policzyła. Typ zawężony do dwóch oszacowań AI: `manual` i `recipe_nutrition` mają własne,
   *   bezwarunkowe ścieżki zapisu (`updateEntry`, `createEntry`), a bez zawężenia tą
   *   metodą dałoby się zapisać `manual` na wpisie, którego użytkownik nie tknął.
   * @param requestedAt - `estimation_requested_at` wiersza zwróconego przez
   *   `markEstimationRequested`, czyli dokładnie w zapisie bazy. `null` znaczy, że to żądanie
   *   niczego nie ostemplowało - wtedy nic nie zapisujemy.
   * @returns Faktyczny stan wiersza albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async applyEstimate(
    userId: string,
    entryId: number,
    calories: number,
    origin: Extract<CalorieOriginEnum, "ai_from_description" | "ai_from_recipe">,
    requestedAt: string | null
  ): Promise<DiaryEntryDto | null> {
    if (requestedAt === null) {
      return this.getEntry(userId, entryId);
    }

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
      .eq("estimation_requested_at", requestedAt)
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
   * Zmienia wybrane pola wpisu użytkownika. Brak pola w komendzie znaczy "bez zmian".
   *
   * Najpierw odczyt wiersza, bo reguły kształtu ilości zależą od tego, co zapisano, a nie od ciała
   * żądania: porcje zmienia się tylko we wpisie, który je ma (także w sierocie po usuniętym
   * przepisie), a tekst ilości - tylko we wpisie bez porcji. Konwersji między kształtami nie ma.
   *
   * Kolumny wartości ustala jedna z czterech gałęzi:
   * - brak `calories` i `recalculate` - wartość, pochodzenie i znacznik zostają nietknięte;
   * - `calories: N` - zapis bezwarunkowy z pochodzeniem `manual` (człowiek nadpisuje oszacowanie),
   *   znacznik nietknięty - wpisanie liczby nie unieważnia faktu, że oszacowanie kiedyś zlecono;
   * - `calories: null` - trzy kolumny `null`;
   * - `recalculate: true` - jak `null`, chyba że parser przepisu ustali wartość dla porcji PO
   *   edycji; wtedy `recipe_nutrition`.
   *
   * Każde wyzerowanie wartości zeruje też `estimation_requested_at`: baza tej reguły nie egzekwuje,
   * a stary znacznik pokazałby wyzerowany wiersz jako "Liczę..." albo "Policz ponownie".
   *
   * Zmiany pól i wynik parsera idą w JEDNYM zapisie. Dwa zapisy zostawiłyby między sobą wiersz bez
   * wartości przy starym znaczniku.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @param command - Zwalidowane pola do zmiany
   * @returns Zaktualizowany wpis albo `null`, gdy taki wpis u tego użytkownika nie istnieje
   * @throws EntryShapeError - gdy pole ilości nie pasuje do kształtu zapisanego wiersza
   */
  async updateEntry(userId: string, entryId: number, command: UpdateDiaryEntryCommand): Promise<DiaryEntryDto | null> {
    const current = await this.getEntry(userId, entryId);

    if (!current) {
      return null;
    }

    if (command.portions !== undefined && current.portions === null) {
      throw new EntryShapeError("portions", "Liczbę porcji można zmienić tylko we wpisie, który ją ma");
    }

    // Pusty tekst ilości przyszedł tu już jako `null` - wyczyszczenie pola nie łamie kształtu.
    if (command.amount_text !== undefined && command.amount_text !== null && current.portions !== null) {
      throw new EntryShapeError("amount_text", "Wpis z liczbą porcji opisuje ilość porcjami, nie tekstem");
    }

    const now = new Date().toISOString();
    const changes: TablesUpdate<"diary_entries"> = { updated_at: now };

    if (command.entry_date !== undefined) changes.entry_date = command.entry_date;
    if (command.content !== undefined) changes.content = command.content;
    if (command.amount_text !== undefined) changes.amount_text = command.amount_text;
    if (command.portions !== undefined) changes.portions = command.portions;

    if (command.recalculate === true) {
      changes.calories = null;
      changes.calorie_origin = null;
      changes.estimation_requested_at = null;

      // Usunięty albo cudzy przepis nie jest tu błędem, tylko brakiem treści: wpis zostaje bez
      // wartości i czeka na wycenę, która i tak zejdzie na gałąź opisową.
      let recipeContent: string | null = null;

      try {
        recipeContent = await this.readOwnRecipeContent(userId, current.source_recipe_id);
      } catch (error) {
        if (!(error instanceof RecipeNotFoundError)) {
          throw error;
        }
      }

      // Porcje po edycji: nowe, jeśli przyszły w tym samym żądaniu, inaczej zapisane. Wpis
      // z przepisem bez porcji parser pomija, tak jak `createEntry`.
      const portions = command.portions ?? current.portions;

      if (recipeContent !== null && portions !== null) {
        const { total } = resolveRecipeCalories(recipeContent, portions);

        if (total !== null) {
          changes.calories = total;
          changes.calorie_origin = "recipe_nutrition";
        }
      }
    } else if (command.calories === null) {
      changes.calories = null;
      changes.calorie_origin = null;
      changes.estimation_requested_at = null;
    } else if (command.calories !== undefined) {
      changes.calories = command.calories;
      changes.calorie_origin = "manual";
    }

    // Zmieniona treść albo ilość unieważnia wycenę zleconą dla poprzedniej wersji wpisu: wynik
    // opisywałby inny posiłek. Zerowanie znacznika odcina ją w `applyEstimate` (warunek na
    // znaczniku), a wiersz wraca do "Policz kalorie". Wpis z wartością nie czeka na żadną wycenę.
    const describesMeal =
      command.content !== undefined || command.amount_text !== undefined || command.portions !== undefined;

    if (describesMeal && changes.calories === undefined && current.calories === null) {
      changes.estimation_requested_at = null;
    }

    // `.maybeSingle()`: wpis mógł zniknąć między odczytem a zapisem - to wciąż "nie ma takiego
    // wpisu", a nie błąd `PGRST116`.
    const { data, error } = await this.supabase
      .from("diary_entries")
      .update(changes)
      .eq("id", entryId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Usuwa wpis użytkownika.
   *
   * `.select("id")`, bo sam DELETE bez `returning` nie mówi, czy cokolwiek trafił: cudzy
   * i nieistniejący wpis kończą się tak samo, pustą listą.
   *
   * @param userId - ID użytkownika
   * @param entryId - ID wpisu
   * @returns `true`, gdy wpis usunięto; `false`, gdy taki wpis u tego użytkownika nie istnieje
   */
  async deleteEntry(userId: string, entryId: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("diary_entries")
      .delete()
      .eq("id", entryId)
      .eq("user_id", userId)
      .select("id");

    if (error) {
      throw error;
    }

    return (data ?? []).length > 0;
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
