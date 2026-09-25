import { formatPortions } from "@/lib/utils/diary-portions";

/**
 * Odmiana liczebnika, nie formatowanie liczby: reguła ma wyjątek (12-14) i osobną ścieżkę dla
 * ułamków, więc obie muszą być przypięte testem, a nie tylko komentarzem.
 */
describe("formatPortions", () => {
  describe("odmiana rzeczownika", () => {
    it("liczba pojedyncza dla jednej porcji", () => {
      expect(formatPortions(1)).toBe("1 porcja");
    });

    it("mianownik mnogi dla końcówek 2-4", () => {
      expect(formatPortions(2)).toBe("2 porcje");
      expect(formatPortions(4)).toBe("4 porcje");
      expect(formatPortions(22)).toBe("22 porcje");
    });

    it("dopełniacz dla pięciu i wyżej", () => {
      expect(formatPortions(5)).toBe("5 porcji");
      expect(formatPortions(25)).toBe("25 porcji");
      expect(formatPortions(99)).toBe("99 porcji");
    });

    it("nastolatki łamią regułę końcówki - 12, 13 i 14 idą do dopełniacza", () => {
      expect(formatPortions(12)).toBe("12 porcji");
      expect(formatPortions(13)).toBe("13 porcji");
      expect(formatPortions(14)).toBe("14 porcji");
    });
  });

  describe("wartości ułamkowe", () => {
    it("zapisuje separator dziesiętny przecinkiem", () => {
      expect(formatPortions(0.5)).toBe("0,5 porcji");
    });

    it("ułamek bierze dopełniacz także wtedy, gdy jego część całkowita wołałaby o liczbę pojedynczą", () => {
      expect(formatPortions(1.5)).toBe("1,5 porcji");
    });
  });
});
