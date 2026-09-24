import {
  ESTIMATION_ABORT_MS,
  ESTIMATION_TIMEOUT_MS,
  resolveEstimationState,
  type EstimationRequestPhase,
} from "@/lib/utils/diary-estimation";
import type { DiaryEntryDto } from "@/types";

/** Chwila odniesienia testów - stała, bo `resolveEstimationState` czyta `now` z argumentu. */
const NOW = Date.parse("2026-09-24T12:00:00.000Z");

const entry = (overrides: Partial<DiaryEntryDto> = {}): DiaryEntryDto => ({
  id: 1,
  user_id: "user-1",
  entry_date: "2026-09-24",
  content: "Owsianka z bananem",
  amount_text: null,
  calories: null,
  calorie_origin: null,
  estimation_requested_at: null,
  portions: null,
  source_recipe_id: null,
  created_at: "2026-09-24T11:00:00.000Z",
  updated_at: "2026-09-24T11:00:00.000Z",
  ...overrides,
});

/** Znacznik oddalony od `NOW` o podaną liczbę milisekund w przeszłość. */
const requestedMsAgo = (ms: number): string => new Date(NOW - ms).toISOString();

const resolve = (row: DiaryEntryDto, phase: EstimationRequestPhase) => resolveEstimationState(row, NOW, phase);

describe("stałe wyceny", () => {
  it("granica minuty to dokładnie 60 000 ms - to z niej wynika kryterium akceptacji US-01", () => {
    expect(ESTIMATION_TIMEOUT_MS).toBe(60_000);
  });

  it("abort przeglądarki ma zapas ponad granicę, żeby nie ucinać żądania, na które serwer ma budżet", () => {
    expect(ESTIMATION_ABORT_MS).toBe(65_000);
    expect(ESTIMATION_ABORT_MS).toBeGreaterThan(ESTIMATION_TIMEOUT_MS);
  });
});

describe("resolveEstimationState", () => {
  describe("wartość obecna", () => {
    it("daje 'valued' dla wpisu z liczbą", () => {
      expect(resolve(entry({ calories: 450, calorie_origin: "manual" }), "none")).toBe("valued");
    });

    it("traktuje zero jako wartość, nie jako jej brak", () => {
      expect(resolve(entry({ calories: 0, calorie_origin: "manual" }), "none")).toBe("valued");
    });

    it("daje 'valued' mimo świeżego znacznika - liczba, która już jest, wygrywa ze wszystkim", () => {
      const row = entry({
        calories: 320,
        calorie_origin: "ai_from_description",
        estimation_requested_at: requestedMsAgo(1_000),
      });

      expect(resolve(row, "none")).toBe("valued");
    });

    it("daje 'valued' nawet przy żądaniu w locie - wartość ręczna zdążyła wcześniej", () => {
      const row = entry({
        calories: 500,
        calorie_origin: "manual",
        estimation_requested_at: requestedMsAgo(1_000),
      });

      expect(resolve(row, "live")).toBe("valued");
    });
  });

  describe("żądanie tej wyspy", () => {
    it("'live' daje 'estimating' mimo znacznika starszego niż minuta", () => {
      const row = entry({ estimation_requested_at: requestedMsAgo(10 * 60_000) });

      expect(resolve(row, "live")).toBe("estimating");
    });

    it("'live' daje 'estimating' także bez znacznika - żądanie dopiero wyszło", () => {
      expect(resolve(entry(), "live")).toBe("estimating");
    });

    it("'settled' przy świeżym znaczniku daje 'stale', nie 'estimating'", () => {
      // Sedno rozróżnienia: dostawca potrafi odmówić w kilka sekund, a znacznik jest wtedy jeszcze
      // długo świeży. Wpis nie może z tego powodu stać na "Liczę..." z zablokowanym polem.
      const row = entry({ estimation_requested_at: requestedMsAgo(2_000) });

      expect(resolve(row, "settled")).toBe("stale");
    });

    it("'settled' bez znacznika daje 'idle' - nie ma czego ponawiać", () => {
      expect(resolve(entry(), "settled")).toBe("idle");
    });
  });

  describe("znacznik z bazy przy phase 'none'", () => {
    it("brak znacznika daje 'idle'", () => {
      expect(resolve(entry(), "none")).toBe("idle");
    });

    it("znacznik sprzed 59 999 ms daje 'estimating' - minuta jeszcze nie minęła", () => {
      const row = entry({ estimation_requested_at: requestedMsAgo(ESTIMATION_TIMEOUT_MS - 1) });

      expect(resolve(row, "none")).toBe("estimating");
    });

    it("znacznik sprzed dokładnie 60 000 ms daje 'stale' - granica należy do 'przepadło'", () => {
      const row = entry({ estimation_requested_at: requestedMsAgo(ESTIMATION_TIMEOUT_MS) });

      expect(resolve(row, "none")).toBe("stale");
    });

    it("znacznik znacznie starszy niż minuta daje 'stale'", () => {
      const row = entry({ estimation_requested_at: requestedMsAgo(5 * 60_000) });

      expect(resolve(row, "none")).toBe("stale");
    });

    it("znacznik nie do odczytania daje 'stale', a nie wpis wiszący na 'Liczę...'", () => {
      const row = entry({ estimation_requested_at: "nie-data" });

      expect(resolve(row, "none")).toBe("stale");
    });
  });
});
