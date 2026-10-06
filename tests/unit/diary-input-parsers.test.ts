import { parseCalories } from "@/lib/utils/diary-calories";
import { parsePortions } from "@/lib/utils/diary-portions";

/**
 * Parsery pól formularza dziennika - pierwsza zapora przed formami liczby, które `Number` czyta
 * po cichu. Bez nich "1e3" zrobiłoby się 1000 kcal (albo tysiącem porcji) i przeszło każdą
 * kontrolę schematu, bo schemat widzi już liczbę. Wyrocznia: pole przyjmuje wyłącznie cyfry
 * (porcje - z opcjonalną częścią dziesiętną po kropce albo przecinku); wszystko inne to `NaN`,
 * które schemat odrzuca tym samym komunikatem co "abc". Puste pole to brak wartości (`null`).
 */
describe("parseCalories", () => {
  it.each(["1e3", "0x1f", "-5", "12.5", "123456"])("%p → NaN", (raw) => {
    expect(parseCalories(raw)).toBeNaN();
  });

  it.each(["", "  "])("%p → null - puste pole to brak wartości, nie zero", (raw) => {
    expect(parseCalories(raw)).toBeNull();
  });

  it('" 250 " → 250 - otaczające spacje nie psują liczby', () => {
    expect(parseCalories(" 250 ")).toBe(250);
  });
});

describe("parsePortions", () => {
  it.each(["1e3", "abc"])("%p → NaN", (raw) => {
    expect(parsePortions(raw)).toBeNaN();
  });

  it.each(["1,5", "1.5"])("%p → 1.5 - przecinek po polsku i kropka znaczą to samo", (raw) => {
    expect(parsePortions(raw)).toBe(1.5);
  });

  it('"" → null', () => {
    expect(parsePortions("")).toBeNull();
  });
});
