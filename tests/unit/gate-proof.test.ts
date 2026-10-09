// Celowo czerwony test: dowód, że wymagany check „Testy jednostkowe” blokuje merge PR-a do master
// (change `testing-quality-gates`, faza 3). Żyje tylko na gałęzi `chore/gate-proof` — nigdy na master.
describe("dowód bramki", () => {
  it("czerwieni job „Testy jednostkowe” przy zielonych pozostałych etapach", () => {
    expect(1 + 1).toBe(3);
  });
});
