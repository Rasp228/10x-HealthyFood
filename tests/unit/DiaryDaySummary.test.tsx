import React from "react";
import { render, screen } from "@testing-library/react";
import DiaryDaySummary from "@/components/diary/DiaryDaySummary";
import type { DiaryEntryDto } from "@/types";

/**
 * Tekst, który widzi użytkownik. PRD („Quality properties”): suma dnia, której brakuje wartości
 * choć jednego wpisu, mówi, że jest niepełna - nigdy nie udaje pełnego bilansu (FR-011).
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

describe("DiaryDaySummary", () => {
  it("przy brakach pokazuje sumę i mówi, ilu wpisów ona nie obejmuje", () => {
    const entries = [
      entry({ id: 1, calories: 500, calorie_origin: "recipe_nutrition", portions: 2, source_recipe_id: 11 }),
      entry({ id: 2, calories: 320, calorie_origin: "ai_from_recipe", portions: 1, source_recipe_id: 12 }),
      entry({ id: 3, calories: 410, calorie_origin: "ai_from_description" }),
      entry({ id: 4, calories: 0, calorie_origin: "manual" }),
      entry({ id: 5, estimation_requested_at: "2026-09-23T07:59:30.000Z" }),
      entry({ id: 6, estimation_requested_at: "2026-09-20T07:00:00.000Z" }),
      entry({ id: 7 }),
    ];

    render(<DiaryDaySummary entries={entries} />);

    expect(screen.getByTestId("diary-day-total").textContent).toBe("1230 kcal");
    expect(screen.getByTestId("diary-day-missing").textContent).toBe(
      "Bez policzonych kalorii: 3 z 7. Suma ich nie obejmuje."
    );
    expect(screen.queryByTestId("diary-day-count")).not.toBeInTheDocument();
  });

  it("gdy każdy wpis ma wartość, podaje liczbę wpisów zamiast adnotacji o brakach", () => {
    const entries = [
      entry({ id: 1, calories: 450, calorie_origin: "manual" }),
      entry({ id: 2, calories: 320, calorie_origin: "ai_from_description" }),
    ];

    render(<DiaryDaySummary entries={entries} />);

    expect(screen.getByTestId("diary-day-total").textContent).toBe("770 kcal");
    expect(screen.getByTestId("diary-day-count").textContent).toBe("Wszystkie wpisy dnia: 2.");
    expect(screen.queryByTestId("diary-day-missing")).not.toBeInTheDocument();
  });

  it("dzień, w którym żaden wpis nie ma wartości, nie udaje zera - zgłasza każdy wpis", () => {
    render(<DiaryDaySummary entries={[entry({ id: 1 }), entry({ id: 2 })]} />);

    expect(screen.getByTestId("diary-day-total").textContent).toBe("0 kcal");
    expect(screen.getByTestId("diary-day-missing").textContent).toBe(
      "Bez policzonych kalorii: 2 z 2. Suma ich nie obejmuje."
    );
  });

  it("pusty dzień to zero kalorii i zero wpisów, bez adnotacji o brakach", () => {
    render(<DiaryDaySummary entries={[]} />);

    expect(screen.getByTestId("diary-day-total").textContent).toBe("0 kcal");
    expect(screen.getByTestId("diary-day-count").textContent).toBe("Wszystkie wpisy dnia: 0.");
    expect(screen.queryByTestId("diary-day-missing")).not.toBeInTheDocument();
  });
});
