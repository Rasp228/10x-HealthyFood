/**
 * @jest-environment node
 */

import { logError, logInfo, logWarn, serializeError } from "@/lib/utils/log";

/** Linia logu z danego kanału, sparsowana - asercje czytają pola, nie cały napis. */
const parsedLine = (spy: jest.SpyInstance, call = 0) => JSON.parse(spy.mock.calls[call][0] as string);

const ORIGINAL_ENV = { ...process.env };

let errorSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = ORIGINAL_ENV;
});

describe("serializeError", () => {
  it("Error: nazwa, komunikat i stos - pola, które JSON.stringify gubi", () => {
    const error = new TypeError("zły typ");

    expect(JSON.stringify(error)).toBe("{}");
    expect(serializeError(error)).toMatchObject({
      name: "TypeError",
      message: "zły typ",
      stack: expect.stringContaining("zły typ"),
    });
  });

  it("zwykły obiekt PostgREST: code, details i hint", () => {
    const postgrestError = {
      message: 'duplicate key value violates unique constraint "preferences_unique_user_category_value"',
      code: "23505",
      details: "Key (user_id, category, value)=(…) already exists.",
      hint: null,
    };

    expect(serializeError(postgrestError)).toEqual({
      name: "Error",
      message: postgrestError.message,
      code: "23505",
      details: postgrestError.details,
    });
  });

  it("status liczbowy zostaje", () => {
    expect(serializeError({ name: "AuthApiError", message: "x", status: 503 })).toMatchObject({ status: 503 });
  });

  it("łańcuch cause serializuje rekurencyjnie, do głębokości 3", () => {
    const root = new Error("poziom 4", { cause: new Error("poziom 5") });
    const error = new Error("poziom 0", {
      cause: new Error("poziom 1", { cause: new Error("poziom 2", { cause: new Error("poziom 3", { cause: root }) }) }),
    });

    const serialized = serializeError(error);

    expect(serialized.cause?.message).toBe("poziom 1");
    expect(serialized.cause?.cause?.message).toBe("poziom 2");
    expect(serialized.cause?.cause?.cause?.message).toBe("poziom 3");
    expect(serialized.cause?.cause?.cause?.cause).toBeUndefined();
  });

  it("cykliczny cause nie zapętla serializacji", () => {
    const error = new Error("a") as Error & { cause?: unknown };
    error.cause = error;

    expect(() => JSON.stringify(serializeError(error))).not.toThrow();
  });

  it("napis staje się komunikatem", () => {
    expect(serializeError("coś poszło nie tak")).toEqual({ name: "Error", message: "coś poszło nie tak" });
  });

  it("undefined i null nie rzucają", () => {
    expect(serializeError(undefined)).toEqual({ name: "UnknownError", message: "undefined" });
    expect(serializeError(null)).toEqual({ name: "UnknownError", message: "null" });
  });
});

describe("logError / logWarn / logInfo", () => {
  it("logError pisze jedną linię JSON do console.error z kontekstem i błędem", () => {
    logError(
      "db.query_failed",
      { requestId: "req-1", userId: "user-1", route: "/api/x", step: "select" },
      {
        message: "boom",
        code: "PGRST116",
      }
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = parsedLine(errorSpy);
    expect(line).toMatchObject({
      level: "error",
      event: "db.query_failed",
      requestId: "req-1",
      userId: "user-1",
      route: "/api/x",
      step: "select",
      error: { message: "boom", code: "PGRST116" },
    });
    expect(new Date(line.time).toISOString()).toBe(line.time);
  });

  it("logWarn i logInfo trafiają do swoich kanałów; bez błędu linia nie ma pola error", () => {
    logWarn("auth.session_invalid", { requestId: "req-2" });
    logInfo("diary.estimated", { requestId: "req-3" });

    expect(parsedLine(warnSpy)).toMatchObject({ level: "warn", event: "auth.session_invalid" });
    expect(parsedLine(infoSpy)).toMatchObject({ level: "info", event: "diary.estimated" });
    expect(parsedLine(warnSpy)).not.toHaveProperty("error");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("lokalnie env i commit to local", () => {
    logInfo("x", {});

    expect(parsedLine(infoSpy)).toMatchObject({ env: "local", commit: "local" });
  });

  it("na Vercelu env z VERCEL_ENV, commit skrócony do 7 znaków", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = "4e14c93abcdef0123456789";

    logInfo("x", {});

    expect(parsedLine(infoSpy)).toMatchObject({ env: "production", commit: "4e14c93" });
  });

  it("pole email jest pomijane", () => {
    logError("auth.login_failed", { requestId: "req-4", email: "jan@example.com" }, new Error("x"));

    expect(parsedLine(errorSpy)).not.toHaveProperty("email");
    expect(errorSpy.mock.calls[0][0]).not.toContain("jan@example.com");
  });

  it("kontekst nie nadpisuje pól linii", () => {
    logWarn("prawdziwe.zdarzenie", { event: "podrobione", level: "info" });

    expect(parsedLine(warnSpy)).toMatchObject({ level: "warn", event: "prawdziwe.zdarzenie" });
  });
});
