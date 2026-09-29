import { z } from "zod";
import {
  amountTextSchema,
  caloriesValueSchema,
  entryContentSchema,
  entryDateSchema,
  portionsSchema,
} from "./create-entry";

/**
 * Identyfikator wpisu dziennika czytany z `params.id`.
 *
 * Parametr ścieżki jest napisem (albo go nie ma), więc walidacja zaczyna się od kształtu, a nie
 * od `parseInt`: `parseInt("12abc")` oddaje 12 i cicho przepuszcza adres, którego nikt nie
 * zamierzał obsłużyć. `Number.isSafeInteger` domyka górną stronę - `id` jest w bazie typu
 * `serial`, a napis dłuższy niż zakres bezpiecznej liczby nie jest żadnym wierszem.
 */
export const entryIdSchema = z
  .string("Identyfikator wpisu jest wymagany")
  .regex(/^\d+$/, "Identyfikator wpisu musi być dodatnią liczbą całkowitą")
  .transform((value) => Number(value))
  .refine((value) => Number.isSafeInteger(value) && value > 0, "Nieprawidłowy identyfikator wpisu");

export type EntryIdSchema = z.infer<typeof entryIdSchema>;

/**
 * Schemat częściowej edycji istniejącego wpisu dziennika.
 *
 * Każde pole jest opcjonalne: zmienia się tylko to, co przyszło. Dzięki temu dawne ciało
 * `{calories: N}` z pola w wierszu działa bez zmian, a wartość i jej pochodzenie stoją, dopóki
 * użytkownik jawnie ich nie dotknie (`calories` albo `recalculate`).
 *
 * `.strict()`, bo lista pól jest zamknięta: `source_recipe_id` jest niezmienny, a
 * `calorie_origin`, `user_id` i `estimation_requested_at` ustala serwer. Nieznany klucz w ciele
 * daje 400, zamiast zostać po cichu pominięty.
 *
 * Schemat pilnuje wyłącznie kształtu pól. Reguła „porcje tylko w wierszu, który je ma; tekst
 * ilości tylko w wierszu bez porcji" zależy od zapisanego wiersza, więc sprawdza ją serwis
 * (`EntryShapeError`).
 *
 * `calories` przyjmuje tu `null` - wyczyszczenie liczby jest częścią edycji. Reguła wartości
 * (`caloriesValueSchema`) się przez to nie poszerza: `null` dokłada ten schemat.
 */
export const updateDiaryEntrySchema = z
  .object({
    entry_date: entryDateSchema.optional(),
    content: entryContentSchema.optional(),
    amount_text: amountTextSchema.nullable().optional(),
    portions: portionsSchema.optional(),
    calories: caloriesValueSchema.nullable().optional(),
    recalculate: z.literal(true, "Pole recalculate przyjmuje wyłącznie wartość true").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Przeliczenie zeruje wartość i uruchamia kaskadę, więc liczba w tym samym żądaniu byłaby
    // sprzecznym poleceniem. Issue stoi na `calories`, bo to pole użytkownik wypełnił.
    if (value.recalculate === true && value.calories !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["calories"],
        message: "Nie można jednocześnie podać kalorii i zlecić przeliczenia",
      });
    }

    // Puste ciało nie dotyczy żadnego pola, więc `path: []` - trafia do ogólnej ramki formularza.
    if (Object.values(value).every((field) => field === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "Nie podano żadnego pola do zmiany",
      });
    }
  });

export type UpdateDiaryEntrySchema = z.infer<typeof updateDiaryEntrySchema>;
