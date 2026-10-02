import { buildIlikeOrFilter, toContainsPattern } from "@/lib/utils/recipe-search";

const COLUMNS = ["title", "content", "additional_params"] as const;

/**
 * Dzieli napis `or()` na ogniwa tak, jak robi to PostgREST: przecinek rozdziela tylko poza
 * cudzysłowem, a `\` wewnątrz cudzysłowu ucieka następny znak.
 */
const splitOutsideQuotes = (filter: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < filter.length; i++) {
    const ch = filter[i];

    if (inQuotes && ch === "\\") {
      current += ch + filter[i + 1];
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  parts.push(current);

  return parts;
};

describe("toContainsPattern", () => {
  it.each([
    ["owsianka", "%owsianka%"],
    ["100%", String.raw`%100\%%`],
    ["a_b", String.raw`%a\_b%`],
    [String.raw`a\b`, String.raw`%a\\b%`],
    ["a*b", "%a_b%"],
    ["a_b*c%", String.raw`%a\_b_c\%%`],
  ])("%s -> %s", (term, expected) => {
    expect(toContainsPattern(term)).toBe(expected);
  });

  it("nie przycina terminu", () => {
    expect(toContainsPattern(" owsianka ")).toBe("% owsianka %");
  });
});

describe("buildIlikeOrFilter", () => {
  it("cytuje wartość dla każdej kolumny", () => {
    expect(buildIlikeOrFilter(COLUMNS, toContainsPattern("100%"))).toBe(
      String.raw`title.ilike."%100\\%%",content.ilike."%100\\%%",additional_params.ilike."%100\\%%"`
    );
  });

  it.each([
    ["przecinek", "a,b", '"%a,b%"'],
    ["nawiasy", "(a)", '"%(a)%"'],
    ["cudzysłów", 'a"b', String.raw`"%a\"b%"`],
    ["ukośnik wsteczny", String.raw`a\b`, String.raw`"%a\\\\b%"`],
  ])("%s w terminie zostaje w jednym ogniwie na kolumnę", (_label, term, quoted) => {
    const filter = buildIlikeOrFilter(COLUMNS, toContainsPattern(term));
    const parts = splitOutsideQuotes(filter);

    expect(parts).toHaveLength(3);
    expect(parts).toEqual(COLUMNS.map((column) => `${column}.ilike.${quoted}`));
  });
});
