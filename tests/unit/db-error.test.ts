/**
 * @jest-environment node
 */

import { DatabaseError, dbError } from "@/lib/utils/db-error";
import { serializeError } from "@/lib/utils/log";

/** Kształt błędu, który Supabase oddaje w `{ error }` - zwykły obiekt, nie `Error`. */
const postgrestError = {
  message: 'new row violates check constraint "diary_entries_value_has_origin"',
  code: "23514",
  details: "Failing row contains (...)",
  hint: null,
};

describe("dbError", () => {
  it("zamienia obiekt PostgREST na DatabaseError ze stosem, code na wierzchu i oryginałem w cause", () => {
    const wrapped = dbError(postgrestError, "createEntry");

    expect(wrapped).toBeInstanceOf(DatabaseError);
    expect(wrapped).toBeInstanceOf(Error);
    expect(wrapped.name).toBe("DatabaseError");
    expect(wrapped.code).toBe("23514");
    expect(wrapped.cause).toBe(postgrestError);
    expect(wrapped.stack).toEqual(expect.any(String));
  });

  it("message to operacja i oryginalny komunikat, więc toThrow po fragmencie dalej przechodzi", () => {
    const wrapped = dbError(postgrestError, "createEntry");

    expect(wrapped.message).toBe('createEntry: new row violates check constraint "diary_entries_value_has_origin"');
    expect(() => {
      throw wrapped;
    }).toThrow("violates check constraint");
  });

  it("przepuszcza message zwykłego Error, bez code, z oryginałem w cause", () => {
    const original = new Error("RLS odrzuciło zapytanie");
    const wrapped = dbError(original, "getEntriesForDay");

    expect(wrapped.message).toBe("getEntriesForDay: RLS odrzuciło zapytanie");
    expect(wrapped.code).toBeUndefined();
    expect(wrapped.cause).toBe(original);
  });

  it("zwraca DatabaseError bez zmian - bez podwójnego prefiksu", () => {
    const once = dbError(postgrestError, "readOwnRecipeContent");

    expect(dbError(once, "updateEntry")).toBe(once);
    expect(once.message).toBe(`readOwnRecipeContent: ${postgrestError.message}`);
  });

  it("obsługuje napis i wartość bez message", () => {
    expect(dbError("zerwane połączenie", "getEntry").message).toBe("getEntry: zerwane połączenie");
    expect(dbError(undefined, "getEntry").message).toBe("getEntry: undefined");
    expect(dbError({ code: "PGRST301" }, "getEntry")).toMatchObject({ message: "getEntry: ", code: "PGRST301" });
  });

  it("serializeError widzi code na wierzchu, a details i hint w cause", () => {
    const serialized = serializeError(dbError(postgrestError, "createEntry"));

    expect(serialized).toMatchObject({
      name: "DatabaseError",
      code: "23514",
      cause: { code: "23514", details: "Failing row contains (redacted)" },
    });
    expect(serialized.stack).toEqual(expect.any(String));
  });
});
