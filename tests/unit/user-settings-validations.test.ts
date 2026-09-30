import { updateDailyGoalSchema } from "@/lib/validations/user-settings/update-goal";

const parse = (input: unknown) => updateDailyGoalSchema.safeParse(input);

/** Komunikat przy polu celu albo `undefined`, gdy walidacja przeszła. */
function messageFor(input: unknown): string | undefined {
  const result = parse(input);

  if (result.success) return undefined;

  return result.error.issues.find((issue) => issue.path.join(".") === "daily_calorie_goal")?.message;
}

describe("updateDailyGoalSchema", () => {
  it("odrzuca 499 - poniżej dolnej granicy CHECK", () => {
    expect(messageFor({ daily_calorie_goal: 499 })).toBe("Cel nie może być niższy niż 500 kcal");
  });

  it("przyjmuje dolną granicę 500", () => {
    expect(parse({ daily_calorie_goal: 500 })).toEqual({ success: true, data: { daily_calorie_goal: 500 } });
  });

  it("przyjmuje górną granicę 10000", () => {
    expect(parse({ daily_calorie_goal: 10000 })).toEqual({ success: true, data: { daily_calorie_goal: 10000 } });
  });

  it("odrzuca 10001 - powyżej górnej granicy CHECK", () => {
    expect(messageFor({ daily_calorie_goal: 10001 })).toBe("Cel nie może przekraczać 10000 kcal");
  });

  it("odrzuca ułamek", () => {
    expect(messageFor({ daily_calorie_goal: 1500.5 })).toBe("Cel musi być liczbą całkowitą");
  });

  it("odrzuca liczbę podaną jako napis", () => {
    expect(messageFor({ daily_calorie_goal: "2000" })).toBe("Cel musi być liczbą");
  });

  it("przyjmuje null - wyczyszczenie celu", () => {
    expect(parse({ daily_calorie_goal: null })).toEqual({ success: true, data: { daily_calorie_goal: null } });
  });

  it("odrzuca brak klucza - to błąd, nie „bez zmian”", () => {
    expect(messageFor({})).toBeDefined();
  });

  it("odrzuca ciało, które nie jest obiektem", () => {
    expect(parse(null).success).toBe(false);
  });
});
