import { createDiaryEntrySchema } from "@/lib/validations/diary/create-entry";
import { listDiaryEntriesSchema } from "@/lib/validations/diary/list-entries";
import { entryIdSchema, updateDiaryEntrySchema } from "@/lib/validations/diary/update-entry";

const VALID_ENTRY = {
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: "1 talerz",
  calories: 450,
};

type EntryResult = ReturnType<typeof createDiaryEntrySchema.safeParse>;

const parseEntry = (overrides: Record<string, unknown> = {}): EntryResult =>
  createDiaryEntrySchema.safeParse({ ...VALID_ENTRY, ...overrides });

/**
 * Wpis utworzony z przepisu: ilość opisuje liczba porcji, nie tekst, a wartość liczy serwer.
 * Osobna baza, bo `VALID_ENTRY` niesie `amount_text`, którego ta ścieżka nie wpuszcza - reguły
 * granic `portions` sprawdzamy na ładunku, który poza nimi jest poprawny.
 */
const parseRecipeEntry = (overrides: Record<string, unknown> = {}): EntryResult =>
  createDiaryEntrySchema.safeParse({
    ...VALID_ENTRY,
    amount_text: null,
    calories: null,
    source_recipe_id: 7,
    portions: 1,
    ...overrides,
  });

/** Komunikat przypisany do konkretnego pola albo `undefined`, gdy pole przeszło walidację. */
function messageFor(result: EntryResult, path: string): string | undefined {
  if (result.success) return undefined;

  return result.error.issues.find((issue) => issue.path.join(".") === path)?.message;
}

/** Dane wyjściowe udanej walidacji. Rzuca, bo test, który tu trafił, oczekiwał sukcesu. */
function dataOf(result: EntryResult) {
  if (!result.success) {
    throw new Error(`Oczekiwano sukcesu walidacji, otrzymano: ${result.error.issues.map((i) => i.message).join(", ")}`);
  }

  return result.data;
}

const repeat = (length: number) => "a".repeat(length);

describe("createDiaryEntrySchema", () => {
  describe("entry_date", () => {
    it("przyjmuje istniejącą datę", () => {
      expect(parseEntry({ entry_date: "2026-09-23" }).success).toBe(true);
    });

    it("przyjmuje 29 lutego w roku przestępnym", () => {
      expect(parseEntry({ entry_date: "2024-02-29" }).success).toBe(true);
    });

    it("odrzuca datę w złym formacie", () => {
      expect(messageFor(parseEntry({ entry_date: "23-09-2026" }), "entry_date")).toBe(
        "Data musi być w formacie RRRR-MM-DD"
      );
    });

    it("odrzuca datę bez zer wiodących", () => {
      expect(messageFor(parseEntry({ entry_date: "2026-9-3" }), "entry_date")).toBe(
        "Data musi być w formacie RRRR-MM-DD"
      );
    });

    it("odrzuca 2026-02-31 - kształt się zgadza, ale taki dzień nie istnieje", () => {
      expect(messageFor(parseEntry({ entry_date: "2026-02-31" }), "entry_date")).toBe("Podana data nie istnieje");
    });

    it("odrzuca 29 lutego w roku nieprzestępnym", () => {
      expect(messageFor(parseEntry({ entry_date: "2026-02-29" }), "entry_date")).toBe("Podana data nie istnieje");
    });

    it("odrzuca brak daty", () => {
      expect(messageFor(parseEntry({ entry_date: undefined }), "entry_date")).toBe("Data jest wymagana");
    });
  });

  describe("content", () => {
    it("odrzuca pusty opis", () => {
      expect(messageFor(parseEntry({ content: "" }), "content")).toBe("Opis posiłku jest wymagany");
    });

    it("odrzuca opis złożony z samych spacji - przycięcie wyprzedza sprawdzenie długości", () => {
      expect(messageFor(parseEntry({ content: "   " }), "content")).toBe("Opis posiłku jest wymagany");
    });

    it("przyjmuje opis jednoznakowy", () => {
      expect(parseEntry({ content: repeat(1) }).success).toBe(true);
    });

    it("przyjmuje opis o długości 500 znaków", () => {
      expect(parseEntry({ content: repeat(500) }).success).toBe(true);
    });

    it("odrzuca opis o długości 501 znaków", () => {
      expect(messageFor(parseEntry({ content: repeat(501) }), "content")).toBe(
        "Opis posiłku nie może przekraczać 500 znaków"
      );
    });

    it("przycina otaczające spacje", () => {
      expect(dataOf(parseEntry({ content: "  Owsianka  " })).content).toBe("Owsianka");
    });
  });

  describe("amount_text", () => {
    it("zamienia puste pole na null - pusty formularz to brak ilości, nie pusty napis", () => {
      expect(dataOf(parseEntry({ amount_text: "" })).amount_text).toBeNull();
    });

    it("zamienia pole z samymi spacjami na null", () => {
      expect(dataOf(parseEntry({ amount_text: "   " })).amount_text).toBeNull();
    });

    it("zachowuje wpisaną ilość, przycinając spacje", () => {
      expect(dataOf(parseEntry({ amount_text: "  1 talerz  " })).amount_text).toBe("1 talerz");
    });

    it("przyjmuje jawne null", () => {
      expect(dataOf(parseEntry({ amount_text: null })).amount_text).toBeNull();
    });

    it("przyjmuje pominięte pole", () => {
      const withoutAmount = {
        entry_date: VALID_ENTRY.entry_date,
        content: VALID_ENTRY.content,
        calories: VALID_ENTRY.calories,
      };

      expect(createDiaryEntrySchema.safeParse(withoutAmount).success).toBe(true);
    });

    it("odrzuca ilość dłuższą niż 100 znaków", () => {
      expect(messageFor(parseEntry({ amount_text: repeat(101) }), "amount_text")).toBe(
        "Ilość nie może przekraczać 100 znaków"
      );
    });
  });

  describe("calories", () => {
    it("przyjmuje zero", () => {
      expect(dataOf(parseEntry({ calories: 0 })).calories).toBe(0);
    });

    it("przyjmuje górną granicę 5000", () => {
      expect(dataOf(parseEntry({ calories: 5000 })).calories).toBe(5000);
    });

    it("odrzuca wartość ujemną", () => {
      expect(messageFor(parseEntry({ calories: -1 }), "calories")).toBe("Kalorie nie mogą być ujemne");
    });

    it("odrzuca wartość powyżej sufitu", () => {
      expect(messageFor(parseEntry({ calories: 5001 }), "calories")).toBe("Kalorie nie mogą przekraczać 5000 kcal");
    });

    it("odrzuca ułamek", () => {
      expect(messageFor(parseEntry({ calories: 450.5 }), "calories")).toBe("Kalorie muszą być liczbą całkowitą");
    });

    it("odrzuca liczbę podaną jako napis", () => {
      expect(messageFor(parseEntry({ calories: "450" }), "calories")).toBe("Kalorie muszą być liczbą");
    });

    it("przyjmuje null - brak wartości jest dozwolonym stanem wpisu", () => {
      expect(dataOf(parseEntry({ calories: null })).calories).toBeNull();
    });
  });

  describe("calorie_origin", () => {
    it("nie przepuszcza pochodzenia podanego przez klienta", () => {
      const result = parseEntry({ calorie_origin: "ai_from_recipe" });

      expect(dataOf(result)).not.toHaveProperty("calorie_origin");
    });
  });

  describe("source_recipe_id", () => {
    it("przyjmuje dodatni identyfikator", () => {
      expect(dataOf(parseRecipeEntry()).source_recipe_id).toBe(7);
    });

    it("odrzuca zero", () => {
      expect(messageFor(parseRecipeEntry({ source_recipe_id: 0 }), "source_recipe_id")).toBe(
        "Identyfikator przepisu musi być dodatni"
      );
    });

    it("odrzuca ułamek", () => {
      expect(messageFor(parseRecipeEntry({ source_recipe_id: 1.5 }), "source_recipe_id")).toBe(
        "Identyfikator przepisu musi być liczbą całkowitą"
      );
    });

    // Wyrocznia: `recipes.id` to `serial` (int4), więc 2147483647 to największy możliwy przepis.
    it("przyjmuje górną granicę int4 2147483647", () => {
      expect(dataOf(parseRecipeEntry({ source_recipe_id: 2147483647 })).source_recipe_id).toBe(2147483647);
    });

    it("odrzuca 2147483648 - ponad zakresem int4 nie ma żadnego przepisu", () => {
      expect(messageFor(parseRecipeEntry({ source_recipe_id: 2147483648 }), "source_recipe_id")).toBe(
        "Nieprawidłowy identyfikator przepisu"
      );
    });

    it("przyjmuje jawne null - wpis opisowy nie pochodzi z żadnego przepisu", () => {
      expect(dataOf(parseEntry({ source_recipe_id: null })).source_recipe_id).toBeNull();
    });
  });

  describe("portions", () => {
    it("odrzuca zero - zjedzenie zera porcji nie jest wpisem", () => {
      expect(messageFor(parseRecipeEntry({ portions: 0 }), "portions")).toBe("Liczba porcji musi być większa od zera");
    });

    it("przyjmuje pół porcji", () => {
      expect(dataOf(parseRecipeEntry({ portions: 0.5 })).portions).toBe(0.5);
    });

    it("przyjmuje górną granicę 99", () => {
      expect(dataOf(parseRecipeEntry({ portions: 99 })).portions).toBe(99);
    });

    it("odrzuca 99,01 - sufit jest twardy", () => {
      expect(messageFor(parseRecipeEntry({ portions: 99.01 }), "portions")).toBe(
        "Liczba porcji nie może przekraczać 99"
      );
    });

    it("przyjmuje dwa miejsca po przecinku - tyle, ile mieści numeric(6,2)", () => {
      expect(dataOf(parseRecipeEntry({ portions: 1.15 })).portions).toBe(1.15);
    });

    it("odrzuca trzy miejsca po przecinku", () => {
      expect(messageFor(parseRecipeEntry({ portions: 1.125 }), "portions")).toBe(
        "Liczba porcji może mieć najwyżej dwa miejsca po przecinku"
      );
    });

    it("odrzuca liczbę podaną jako napis", () => {
      expect(messageFor(parseRecipeEntry({ portions: "2" }), "portions")).toBe("Liczba porcji musi być liczbą");
    });
  });

  describe("reguły wzajemne", () => {
    it("odrzuca liczbę porcji bez przepisu - komunikatem przy polu, nie w ramce formularza", () => {
      expect(messageFor(parseEntry({ portions: 2 }), "portions")).toBe(
        "Liczbę porcji można podać tylko dla wpisu utworzonego z przepisu"
      );
    });

    it("odrzuca przepis bez liczby porcji", () => {
      expect(messageFor(parseEntry({ source_recipe_id: 7, amount_text: null, portions: undefined }), "portions")).toBe(
        "Liczba porcji jest wymagana dla wpisu utworzonego z przepisu"
      );
    });

    it("odrzuca wpis z przepisu niosący jednocześnie ilość tekstową", () => {
      expect(messageFor(parseRecipeEntry({ amount_text: "1 talerz" }), "amount_text")).toBe(
        "Wpis utworzony z przepisu opisuje ilość liczbą porcji, nie tekstem"
      );
    });

    it("przepuszcza wpis z przepisu z pustym polem ilości - puste pole to brak ilości", () => {
      expect(dataOf(parseRecipeEntry({ amount_text: "" })).amount_text).toBeNull();
    });

    it("przepuszcza wpis opisowy bez obu pól - ścieżka sprzed zmiany zostaje nietknięta", () => {
      expect(parseEntry().success).toBe(true);
    });
  });
});

describe("listDiaryEntriesSchema", () => {
  it("przyjmuje istniejącą datę", () => {
    expect(listDiaryEntriesSchema.safeParse({ date: "2026-09-23" }).success).toBe(true);
  });

  it("odrzuca brak parametru - serwer nie domyśla dnia za przeglądarkę", () => {
    const result = listDiaryEntriesSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("odrzuca datę w złym formacie", () => {
    const result = listDiaryEntriesSchema.safeParse({ date: "wczoraj" });

    expect(result.success).toBe(false);
  });

  it("odrzuca 2026-02-31 tą samą regułą co tworzenie wpisu", () => {
    const result = listDiaryEntriesSchema.safeParse({ date: "2026-02-31" });

    if (result.success) throw new Error("Oczekiwano błędu walidacji");

    expect(result.error.issues[0].message).toBe("Podana data nie istnieje");
  });
});

describe("updateDiaryEntrySchema", () => {
  type UpdateResult = ReturnType<typeof updateDiaryEntrySchema.safeParse>;

  const parseUpdate = (input: unknown): UpdateResult => updateDiaryEntrySchema.safeParse(input);

  /** Komunikat dla danej ścieżki albo `undefined`, gdy walidacja przeszła lub ścieżka jest czysta. */
  const messageFor = (input: unknown, path: string): string | undefined => {
    const result = parseUpdate(input);

    if (result.success) return undefined;

    return result.error.issues.find((issue) => issue.path.join(".") === path)?.message;
  };

  /** Dane po udanej walidacji. Rzuca, bo test, który tu trafił, oczekiwał sukcesu. */
  const dataOf = (input: unknown) => {
    const result = parseUpdate(input);

    if (!result.success) {
      throw new Error(
        `Oczekiwano sukcesu walidacji, otrzymano: ${result.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    return result.data;
  };

  it("przyjmuje częściowe ciało - zmienia się tylko to, co przyszło", () => {
    expect(dataOf({ content: "  Owsianka bez cukru  " })).toEqual({ content: "Owsianka bez cukru" });
  });

  it("przyjmuje dawne ciało {calories: N} z pola w wierszu", () => {
    expect(dataOf({ calories: 450 })).toEqual({ calories: 450 });
  });

  it("odrzuca puste ciało komunikatem bez ścieżki pola", () => {
    const result = parseUpdate({});

    if (result.success) throw new Error("Oczekiwano błędu walidacji");

    // `path: []` - problem nie dotyczy żadnego pola, więc trafia do ogólnej ramki formularza.
    expect(result.error.issues).toHaveLength(1);
    expect(result.error.issues[0].path).toEqual([]);
  });

  it("odrzuca ciało, które nie jest obiektem", () => {
    expect(parseUpdate(null).success).toBe(false);
  });

  it("recalculate razem z calories daje błąd na polu calories", () => {
    expect(messageFor({ recalculate: true, calories: 450 }, "calories")).toBe(
      "Nie można jednocześnie podać kalorii i zlecić przeliczenia"
    );
  });

  it("recalculate razem z calories: null też jest sprzecznym poleceniem", () => {
    expect(messageFor({ recalculate: true, calories: null }, "calories")).toBeDefined();
  });

  it("przyjmuje samo recalculate: true", () => {
    expect(dataOf({ recalculate: true })).toEqual({ recalculate: true });
  });

  it("odrzuca recalculate: false - przeliczenie zleca się wyłącznie jawnym true", () => {
    expect(parseUpdate({ recalculate: false }).success).toBe(false);
  });

  it.each(["source_recipe_id", "calorie_origin", "user_id", "estimation_requested_at"])(
    "odrzuca pole %s w ciele - schemat jest zamknięty",
    (field) => {
      const value = field === "source_recipe_id" ? 7 : "cokolwiek";

      expect(parseUpdate({ content: "Owsianka", [field]: value }).success).toBe(false);
    }
  );

  it("przyjmuje calories: null - wyczyszczenie liczby jest częścią edycji", () => {
    expect(dataOf({ calories: null })).toEqual({ calories: null });
  });

  it("odrzuca portions: null - wpis z porcjami nie traci ich przez edycję", () => {
    expect(parseUpdate({ portions: null }).success).toBe(false);
  });

  it("stosuje do portions tę samą regułę co tworzenie wpisu", () => {
    expect(messageFor({ portions: 0 }, "portions")).toBe("Liczba porcji musi być większa od zera");
    expect(dataOf({ portions: 1.5 })).toEqual({ portions: 1.5 });
  });

  it("zamienia pusty amount_text na null", () => {
    expect(dataOf({ amount_text: "   " })).toEqual({ amount_text: null });
  });

  it("odrzuca pustą treść tym samym komunikatem co tworzenie wpisu", () => {
    expect(messageFor({ content: "   " }, "content")).toBe("Opis posiłku jest wymagany");
  });

  it("odrzuca nieistniejący dzień tą samą regułą co tworzenie wpisu", () => {
    expect(messageFor({ entry_date: "2026-02-31" }, "entry_date")).toBe("Podana data nie istnieje");
  });

  it("stosuje do calories te same granice co tworzenie wpisu", () => {
    expect(dataOf({ calories: 0 })).toEqual({ calories: 0 });
    expect(messageFor({ calories: -1 }, "calories")).toBe("Kalorie nie mogą być ujemne");
    expect(messageFor({ calories: 5001 }, "calories")).toBe("Kalorie nie mogą przekraczać 5000 kcal");
    expect(messageFor({ calories: 450.5 }, "calories")).toBe("Kalorie muszą być liczbą całkowitą");
    expect(messageFor({ calories: "450" }, "calories")).toBe("Kalorie muszą być liczbą");
  });
});

describe("entryIdSchema", () => {
  it("zamienia napis z adresu na liczbę", () => {
    expect(entryIdSchema.safeParse("42")).toEqual({ success: true, data: 42 });
  });

  it("odrzuca identyfikator z doklejonymi znakami", () => {
    expect(entryIdSchema.safeParse("12abc").success).toBe(false);
  });

  it("odrzuca zero", () => {
    expect(entryIdSchema.safeParse("0").success).toBe(false);
  });

  // Wyrocznia: `diary_entries.id` to `serial`, czyli int4 - największy wiersz ma 2147483647
  // (literał typu Postgresa, nie wartość wzięta ze schematu). Krok dalej nie jest żadnym wierszem.
  it.each([
    ["2147483647", true],
    ["2147483648", false],
  ])("identyfikator %s na granicy int4 → przechodzi: %s", (id, passes) => {
    expect(entryIdSchema.safeParse(id).success).toBe(passes);
  });

  it("2147483648 odrzuca komunikatem identyfikatora wpisu", () => {
    const result = entryIdSchema.safeParse("2147483648");

    if (result.success) throw new Error("Oczekiwano błędu walidacji");

    expect(result.error.issues[0].message).toBe("Nieprawidłowy identyfikator wpisu");
  });
});
