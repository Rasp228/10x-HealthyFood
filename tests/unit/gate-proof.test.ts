// Celowo czerwony test: dowód, że wymagany check „Testy jednostkowe” blokuje merge PR-a do master
// (change `testing-quality-gates`, faza 3). Żyje tylko na gałęzi `chore/gate-proof` — nigdy na master.
describe("dowód bramki", () => {
  it("czerwieni job „Testy jednostkowe” przy zielonych pozostałych etapach", () => {
    expect(1 + 1).toBe(3);
  });

  // Wariant 2: błąd typu czerwieni „Kontrolę jakości kodu” na `typecheck`, a testy kończą się
  // `skipped` — wymagany check ze `skipped` ma dalej blokować merge.
  it("czerwieni typecheck", () => {
    // Celowe przypisanie number do string.
    const value: string = 42;
    expect(value).toBe("42");
  });
});
