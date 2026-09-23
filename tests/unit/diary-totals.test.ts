import { summarizeDay } from "@/lib/utils/diary-totals";
import type { DiaryEntryDto } from "@/types";

/**
 * Wpis dnia w minimalnej postaci. Testy nadpisują tylko te pola, o których mówią - reszta
 * kolumn `diary_entries` jest tu obecna, bo `DiaryEntryDto` to wiersz tabeli, a nie kształt
 * wymyślony na potrzeby podsumowania.
 */
const entry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto => ({
  id: 1,
  user_id: "user-1",
  entry_date: "2026-09-23",
  content: "Owsianka z bananem",
  amount_text: null,
  calories: null,
  calorie_origin: null,
  estimation_requested_at: null,
  portions: null,
  source_recipe_id: null,
  created_at: "2026-09-23T07:00:00.000Z",
  updated_at: "2026-09-23T07:00:00.000Z",
  ...overrides,
});

describe("summarizeDay", () => {
  describe("dzień bez wpisów", () => {
    it("zwraca zera na wszystkich trzech licznikach", () => {
      expect(summarizeDay([])).toEqual({
        calorieTotal: 0,
        missingCount: 0,
        entryCount: 0,
      });
    });
  });

  describe("dzień, w którym każdy wpis ma wartość", () => {
    const entries = [
      entry({ id: 1, calories: 450, calorie_origin: "manual" }),
      entry({ id: 2, calories: 320, calorie_origin: "manual" }),
      entry({ id: 3, calories: 0, calorie_origin: "manual" }),
    ];

    it("sumuje wszystkie kalorie", () => {
      expect(summarizeDay(entries).calorieTotal).toBe(770);
    });

    it("nie zgłasza żadnego braku", () => {
      expect(summarizeDay(entries).missingCount).toBe(0);
    });

    it("liczy wpisy, a nie kilokalorie", () => {
      expect(summarizeDay(entries).entryCount).toBe(3);
    });
  });

  describe("dzień mieszany", () => {
    const entries = [
      entry({ id: 1, calories: 450, calorie_origin: "manual" }),
      entry({ id: 2, calories: null, calorie_origin: null }),
      entry({ id: 3, calories: 120, calorie_origin: "manual" }),
      entry({ id: 4, calories: null, calorie_origin: null }),
    ];

    it("pomija w sumie wpisy bez wartości", () => {
      expect(summarizeDay(entries).calorieTotal).toBe(570);
    });

    it("raportuje, ile wpisów zostało poza sumą", () => {
      expect(summarizeDay(entries).missingCount).toBe(2);
    });

    it("nie traktuje braku wartości jako zera - suma i liczba wpisów się rozjeżdżają", () => {
      const summary = summarizeDay(entries);

      expect(summary.entryCount).toBe(4);
      expect(summary.entryCount - summary.missingCount).toBe(2);
    });
  });

  describe("dzień, w którym żaden wpis nie ma wartości", () => {
    const entries = [entry({ id: 1 }), entry({ id: 2 }), entry({ id: 3 })];

    it("pokazuje zero kalorii, ale zgłasza każdy wpis jako brakujący", () => {
      expect(summarizeDay(entries)).toEqual({
        calorieTotal: 0,
        missingCount: 3,
        entryCount: 3,
      });
    });

    it("odróżnia się od pustego dnia mimo tej samej sumy", () => {
      const empty = summarizeDay([]);
      const withoutValues = summarizeDay(entries);

      expect(withoutValues.calorieTotal).toBe(empty.calorieTotal);
      expect(withoutValues.missingCount).not.toBe(empty.missingCount);
    });
  });
});
