import { addDays, isAfter, toLocalDay } from "@/lib/utils/diary-day";

/**
 * Data o kontrolowanym rozjeździe między dniem lokalnym a dniem UTC.
 *
 * Strefa czasowa maszyny nie nadaje się tu na narzędzie: w UTC dzień lokalny i dzień UTC zawsze
 * się zgadzają, więc `toISOString().slice(0, 10)` przeszedłby każdy test - a to dokładnie ta
 * pomyłka, przed którą ostrzega komentarz w `diary-day.ts`. CI zwykle stoi w UTC. Przypięcie
 * `process.env.TZ` też nie zadziała: Jest podstawia pod `process.env` proxy nad zwykłym obiektem,
 * więc zapis nigdy nie dociera do Node'a i nie przelicza `Date`.
 *
 * Dlatego instant UTC zostaje prawdziwy, a przesłaniamy tylko lokalne gettery - i to na samej
 * instancji, nie na prototypie, żeby nic nie wyciekło poza ten obiekt. Test pyta więc wprost
 * o kontrakt: `toLocalDay` czyta dzień z getterów lokalnych, nie z napisu UTC.
 */
function dateWithLocalDay(utcInstant: string, local: { year: number; month: number; day: number }): Date {
  const date = new Date(utcInstant);

  date.getFullYear = () => local.year;
  date.getMonth = () => local.month - 1;
  date.getDate = () => local.day;

  return date;
}

describe("toLocalDay", () => {
  describe("w dowolnej strefie czasowej", () => {
    it("zwraca dzień, z którego złożono datę - tuż po północy", () => {
      expect(toLocalDay(new Date(2026, 0, 15, 0, 30))).toBe("2026-01-15");
    });

    it("zwraca dzień, z którego złożono datę - tuż przed północą", () => {
      expect(toLocalDay(new Date(2026, 0, 15, 23, 30))).toBe("2026-01-15");
    });

    it("uzupełnia miesiąc i dzień zerem wiodącym", () => {
      expect(toLocalDay(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
    });

    it("liczy miesiące od jednego, a nie od zera", () => {
      expect(toLocalDay(new Date(2026, 11, 31, 12, 0))).toBe("2026-12-31");
    });
  });

  describe("o 00:30 w strefie na wschód od UTC", () => {
    // 15 stycznia 2026, 00:30 lokalnie przy UTC+1 - w UTC trwa jeszcze 14 stycznia.
    const now = () => dateWithLocalDay("2026-01-14T23:30:00.000Z", { year: 2026, month: 1, day: 15 });

    it("zwraca dzień przeglądarki, a nie dzień UTC", () => {
      expect(toLocalDay(now())).toBe("2026-01-15");
    });

    it("nie pokrywa się z toISOString().slice(0, 10) - to jest ta pomyłka, której pilnujemy", () => {
      const date = now();

      expect(date.toISOString().slice(0, 10)).toBe("2026-01-14");
      expect(toLocalDay(date)).not.toBe(date.toISOString().slice(0, 10));
    });
  });

  describe("o 23:30 w strefie na zachód od UTC", () => {
    // 15 stycznia 2026, 23:30 lokalnie przy UTC-5 - w UTC trwa już 16 stycznia.
    const now = () => dateWithLocalDay("2026-01-16T04:30:00.000Z", { year: 2026, month: 1, day: 15 });

    it("zwraca dzień przeglądarki, a nie dzień UTC", () => {
      expect(toLocalDay(now())).toBe("2026-01-15");
    });

    it("nie pokrywa się z toISOString().slice(0, 10) - to jest ta pomyłka, której pilnujemy", () => {
      const date = now();

      expect(date.toISOString().slice(0, 10)).toBe("2026-01-16");
      expect(toLocalDay(date)).not.toBe(date.toISOString().slice(0, 10));
    });
  });
});

describe("addDays", () => {
  describe("na granicy miesiąca", () => {
    it("przechodzi z ostatniego dnia miesiąca na pierwszy dzień następnego", () => {
      expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    });

    it("cofa się z pierwszego dnia miesiąca na ostatni dzień poprzedniego", () => {
      expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("zna 29 lutego w roku przestępnym", () => {
      expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    });
  });

  // Powód, dla którego `addDays` liczy w UTC, a nie lokalnym kalendarzem: w te dwie noce doba
  // trwa 23 albo 25 godzin i przesunięcie liczone lokalnie gubi lub dubluje dzień.
  describe("na granicy zmiany czasu", () => {
    it("przechodzi przez noc, w której zegar idzie do przodu", () => {
      expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    });

    it("przechodzi przez noc, w której zegar idzie do tyłu", () => {
      expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    });
  });

  describe("na granicy roku", () => {
    it("przechodzi z sylwestra na nowy rok", () => {
      expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    });

    it("cofa się z nowego roku na sylwestra", () => {
      expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    });
  });

  describe("wewnątrz miesiąca", () => {
    it("przesuwa o zadaną liczbę dób", () => {
      expect(addDays("2026-09-23", 7)).toBe("2026-09-30");
    });

    it("zero dób zostawia dzień bez zmiany", () => {
      expect(addDays("2026-09-23", 0)).toBe("2026-09-23");
    });
  });
});

describe("isAfter", () => {
  it("rozpoznaje dzień późniejszy", () => {
    expect(isAfter("2026-09-24", "2026-09-23")).toBe(true);
  });

  it("rozpoznaje dzień wcześniejszy", () => {
    expect(isAfter("2026-09-22", "2026-09-23")).toBe(false);
  });

  it("dla tego samego dnia zwraca false - równość to nie 'później'", () => {
    expect(isAfter("2026-09-23", "2026-09-23")).toBe(false);
  });

  it("porządkuje także przez granicę roku", () => {
    expect(isAfter("2026-01-01", "2025-12-31")).toBe(true);
  });
});
