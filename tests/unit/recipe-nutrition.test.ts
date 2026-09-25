import { readPerPortionCalories, resolveRecipeCalories } from "@/lib/utils/recipe-nutrition";

/**
 * Ten plik jest jedynym miejscem, w którym lista rozpoznawanych nagłówków i etykiet jest widoczna
 * w całości. To lista decyzji produktowych (FR-009), nie szczegół implementacji — dlatego warianty
 * stoją tu wypisane po jednym, a nie zwinięte w pętlę po tablicy.
 */

/** Sklejka linii w treść przepisu — czytelniejsza niż `\n` w literałach. */
const recipe = (...lines: string[]): string => lines.join("\n");

describe("readPerPortionCalories — rozpoznanie nagłówka", () => {
  describe("nagłówki samodeklarujące porcję", () => {
    it("rozpoznaje 'Wartości odżywcze (porcja):'", () => {
      expect(readPerPortionCalories(recipe("Wartości odżywcze (porcja):", "Kalorie: 250 kcal"))).toBe(250);
    });

    it("rozpoznaje 'Wartości odżywcze na porcję' bez dwukropka", () => {
      expect(readPerPortionCalories(recipe("Wartości odżywcze na porcję", "Kalorie: 250 kcal"))).toBe(250);
    });

    it("rozpoznaje 'Wartości odżywcze — 1 porcja'", () => {
      expect(readPerPortionCalories(recipe("Wartości odżywcze — 1 porcja", "Kalorie: 250 kcal"))).toBe(250);
    });

    it("rozpoznaje wariant bez ogonków: 'Wartosci odzywcze (porcja)'", () => {
      expect(readPerPortionCalories(recipe("Wartosci odzywcze (porcja)", "Kalorie: 250 kcal"))).toBe(250);
    });

    it("rozpoznaje angielskie 'Nutrition (per serving)'", () => {
      expect(readPerPortionCalories(recipe("Nutrition (per serving)", "Calories: 250 kcal"))).toBe(250);
    });

    it("nie jest czuły na wielkość liter", () => {
      expect(readPerPortionCalories(recipe("WARTOŚCI ODŻYWCZE (PORCJA):", "KALORIE: 250 KCAL"))).toBe(250);
    });
  });

  describe("nagłówki odrzucone — blok, który nie mówi, ile jedzenia opisuje", () => {
    it("odrzuca 'Wartości odżywcze:' bez słowa o porcji", () => {
      expect(readPerPortionCalories(recipe("Wartości odżywcze:", "Kalorie: 250 kcal"))).toBeNull();
    });

    it("odrzuca 'Wartości odżywcze (całość)' — to jawnie nie jest porcja", () => {
      expect(readPerPortionCalories(recipe("Wartości odżywcze (całość)", "Kalorie: 2000 kcal"))).toBeNull();
    });

    it("odrzuca 'Składniki:' — nie jest blokiem odżywczym", () => {
      expect(readPerPortionCalories(recipe("Składniki:", "Kalorie: 250 kcal"))).toBeNull();
    });

    it("odrzuca samo słowo o porcji bez znacznika bloku odżywczego", () => {
      expect(readPerPortionCalories(recipe("Liczba porcji: 4", "Kalorie: 250 kcal"))).toBeNull();
    });
  });
});

describe("readPerPortionCalories — etykieta linii z kaloriami", () => {
  const withHeader = (line: string) => recipe("Wartości odżywcze (porcja):", line);

  it("czyta etykietę 'Kalorie'", () => {
    expect(readPerPortionCalories(withHeader("Kalorie: 250 kcal"))).toBe(250);
  });

  it("czyta etykietę 'Kaloryczność'", () => {
    expect(readPerPortionCalories(withHeader("Kaloryczność: 250 kcal"))).toBe(250);
  });

  it("czyta etykietę 'Energia'", () => {
    expect(readPerPortionCalories(withHeader("Energia: 250 kcal"))).toBe(250);
  });

  it("czyta etykietę 'Calories'", () => {
    expect(readPerPortionCalories(withHeader("Calories: 250 kcal"))).toBe(250);
  });

  it("czyta etykietę 'Energy'", () => {
    expect(readPerPortionCalories(withHeader("Energy: 250 kcal"))).toBe(250);
  });

  it("przyjmuje liczbę bez jednostki", () => {
    expect(readPerPortionCalories(withHeader("Kalorie: 250"))).toBe(250);
  });

  it("przyjmuje liczbę dziesiętną z przecinkiem", () => {
    expect(readPerPortionCalories(withHeader("Kalorie: 250,5 kcal"))).toBe(250.5);
  });

  it("przyjmuje linię wypunktowaną", () => {
    expect(readPerPortionCalories(withHeader("- Kalorie: 250 kcal"))).toBe(250);
  });

  it("czyta liczbę stojącą w linii nagłówka", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze (na porcję): Kalorie 250 kcal, Białko 10 g"))).toBe(250);
  });

  it("nie bierze liczby sprzed etykiety — '1 porcja' w nagłówku nie jest kaloriami", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze — 1 porcja: Kalorie 250 kcal"))).toBe(250);
  });

  it("zwraca null dla bloku bez linii z kaloriami", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze (porcja):", "Białko: 10 g", "Tłuszcz: 5 g"))).toBeNull();
  });

  it("zwraca null dla pustej treści", () => {
    expect(readPerPortionCalories("")).toBeNull();
  });
});

describe("readPerPortionCalories — liczba opisana jednostką, bez etykiety", () => {
  it("czyta wartości wypisane ciągiem, tak jak pisze je generator przepisów tej aplikacji", () => {
    const content = recipe("WARTOŚCI ODŻYWCZE (na porcję):", "~450 kcal, 25g białka, 30g tłuszczów, 20g węglowodanów");

    expect(readPerPortionCalories(content)).toBe(450);
  });

  it("nie bierze liczby stojącej przy innej jednostce", () => {
    const content = recipe("Wartości odżywcze (na porcję):", "25 g białka, 450 kcal, 30 g tłuszczu");

    expect(readPerPortionCalories(content)).toBe(450);
  });

  it("nie bierze gołej liczby bez etykiety i bez jednostki", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze (na porcję):", "450"))).toBeNull();
  });

  it("kJ nie prześlizguje się tą ścieżką — wzorzec żąda dosłownie kcal", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze (na porcję):", "1046 kJ, 25 g białka"))).toBeNull();
  });

  it("etykieta ma pierwszeństwo przed jednostką w tej samej linii", () => {
    const content = recipe("Wartości odżywcze (na porcję):", "Kalorie: 250 kcal (w 100 g: 180 kcal)");

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("blok opisujący 100 g zostaje odrzucony mimo jawnego 'kcal' — nagłówek nie deklaruje porcji", () => {
    // Prawdziwy przepis z aplikacji: gdyby ten blok przeszedł, wartość dla 100 g zostałaby
    // pomnożona przez liczbę porcji. To jest cała treść zawężenia FR-009.
    const content = recipe(
      "Porcje: do 1000 g ciasta",
      "",
      "W 100 g: Wartość energetyczna 220 kcal | Węglowodany 18 g | Białko 4 g"
    );

    expect(readPerPortionCalories(content)).toBeNull();
  });
});

describe("readPerPortionCalories — kilodżule dyskwalifikują liczbę, nie linię", () => {
  it("pomija linię z samym kJ i bierze sąsiednią z kcal", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Energia: 1046 kJ", "Kalorie: 250 kcal");

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("z 'Energia: 1046 kJ (250 kcal)' bierze 250, nigdy 1046 i nigdy null", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Energia: 1046 kJ (250 kcal)");
    const value = readPerPortionCalories(content);

    expect(value).toBe(250);
    expect(value).not.toBe(1046);
  });

  it("pomija kJ zapisane bez spacji", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Energia: 1046kJ (250 kcal)");

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("zwraca null, gdy w bloku stoi wyłącznie wartość w kJ", () => {
    expect(readPerPortionCalories(recipe("Wartości odżywcze (porcja):", "Energia: 1046 kJ"))).toBeNull();
  });
});

describe("readPerPortionCalories — zakres bloku", () => {
  it("przy kilku pasujących nagłówkach liczy się pierwszy", () => {
    const content = recipe(
      "Wartości odżywcze (porcja):",
      "Kalorie: 250 kcal",
      "",
      "Wartości odżywcze na porcję:",
      "Kalorie: 900 kcal"
    );

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("pusta linia ucina blok — liczba spod kolejnego nagłówka nie wycieka", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Białko: 10 g", "", "Kalorie: 1000 kcal");

    expect(readPerPortionCalories(content)).toBeNull();
  });

  it("nagłówek kolejnej sekcji ucina blok także bez pustej linii przed nim", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Białko: 10 g", "Przygotowanie:", "Kalorie: 1000 kcal");

    expect(readPerPortionCalories(content)).toBeNull();
  });

  it("linia z dwukropkiem w środku i liczbą bloku NIE ucina", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Porcja: 1 sztuka", "Kalorie: 250 kcal");

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("linia kończąca się dwukropkiem, ale z cyfrą, bloku NIE ucina", () => {
    const content = recipe("Wartości odżywcze (porcja):", "Na 100 g:", "Kalorie: 250 kcal");

    expect(readPerPortionCalories(content)).toBe(250);
  });

  it("blok ma najwyżej dziesięć linii — liczba z jedenastej już nie wchodzi", () => {
    const filler = Array.from({ length: 9 }, (_, index) => `Składnik ${index + 1}: 10 g`);
    const content = recipe("Wartości odżywcze (porcja):", ...filler, "Kalorie: 250 kcal");

    expect(readPerPortionCalories(content)).toBeNull();
  });
});

describe("resolveRecipeCalories — skalowanie liczbą porcji", () => {
  const withCalories = (perPortion: number) => recipe("Wartości odżywcze (porcja):", `Kalorie: ${perPortion} kcal`);

  it("mnoży wartość na porcję przez liczbę porcji", () => {
    expect(resolveRecipeCalories(withCalories(250), 3)).toEqual({
      perPortion: 250,
      total: 750,
      reason: "ok",
    });
  });

  it("zostawia wartość bez zmian dla jednej porcji", () => {
    expect(resolveRecipeCalories(withCalories(250), 1)).toEqual({
      perPortion: 250,
      total: 250,
      reason: "ok",
    });
  });

  it("zaokrągla wynik ułamkowy: 333 × 0,5 = 167", () => {
    expect(resolveRecipeCalories(withCalories(333), 0.5)).toEqual({
      perPortion: 333,
      total: 167,
      reason: "ok",
    });
  });

  it("przyjmuje dokładnie 5000 kcal jako wartość w zakresie", () => {
    expect(resolveRecipeCalories(withCalories(1000), 5)).toEqual({
      perPortion: 1000,
      total: 5000,
      reason: "ok",
    });
  });

  it("odrzuca wynik ponad 5000 kcal, zachowując wartość na porcję", () => {
    expect(resolveRecipeCalories(withCalories(900), 6)).toEqual({
      perPortion: 900,
      total: null,
      reason: "out_of_range",
    });
  });

  it("zwraca 'no_declared_block' dla przepisu bez zadeklarowanego bloku", () => {
    expect(resolveRecipeCalories(recipe("Wartości odżywcze:", "Kalorie: 250 kcal"), 2)).toEqual({
      perPortion: null,
      total: null,
      reason: "no_declared_block",
    });
  });

  it("zwraca 'no_declared_block' dla pustej treści", () => {
    expect(resolveRecipeCalories("", 1)).toEqual({
      perPortion: null,
      total: null,
      reason: "no_declared_block",
    });
  });

  it("rozróżnia brak bloku od wartości poza zakresem — to na tym rozróżnieniu stoi S-04", () => {
    const missing = resolveRecipeCalories(recipe("Składniki:", "Mąka"), 1);
    const tooLarge = resolveRecipeCalories(withCalories(900), 6);

    expect(missing.reason).toBe("no_declared_block");
    expect(tooLarge.reason).toBe("out_of_range");
  });
});
