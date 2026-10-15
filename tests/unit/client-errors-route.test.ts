/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasa buduje `Response`, a jsdom tej klasy nie dostarcza.
 * Ten sam powód co w `user-settings-route.test.ts`.
 */

import { POST } from "@/pages/api/client-errors";

/** Użytkownik w kształcie `locals.user` z middleware; `undefined` udaje żądanie bez sesji. */
let sessionUser: { id: string; email: string } | undefined;

type RouteContext = Parameters<typeof POST>[0];

const event = (overrides: Record<string, unknown> = {}) => ({
  kind: "unhandledrejection",
  message: "probe",
  stack: "Error: probe\n    at <anonymous>:1:16",
  source: "https://example.test/_astro/DiaryPage.js",
  path: "/diary",
  at: "2026-10-15T10:00:00.000Z",
  ...overrides,
});

const postContext = (body: unknown = { events: [event()] }, options: { raw?: string; headers?: HeadersInit } = {}) =>
  ({
    request: new Request("http://localhost/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8", ...options.headers },
      body: options.raw ?? JSON.stringify(body),
    }),
    locals: { supabase: {}, user: sessionUser, requestId: "req-1" },
  }) as unknown as RouteContext;

let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  sessionUser = { id: "user-1", email: "test@example.com" };
  // W `beforeEach`, bo `jest.setup.ts` podmienia `console.warn` w `beforeAll`.
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleWarn.mockRestore();
});

const warnLines = () => consoleWarn.mock.calls.map((call) => JSON.parse(call[0] as string));

describe("POST /api/client-errors", () => {
  it("401 bez sesji i bez linii logu", async () => {
    sessionUser = undefined;

    const response = await POST(postContext());

    expect(response.status).toBe(401);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("204 i linia `client.<kind>` z requestId, userId, ścieżką i źródłem", async () => {
    const response = await POST(postContext());

    expect(response.status).toBe(204);
    expect(warnLines()).toEqual([
      expect.objectContaining({
        level: "warn",
        event: "client.unhandledrejection",
        requestId: "req-1",
        userId: "user-1",
        path: "/diary",
        source: "https://example.test/_astro/DiaryPage.js",
        message: "probe",
      }),
    ]);
  });

  it("linia logu nie niesie adresu e-mail użytkownika", async () => {
    await POST(postContext());

    expect(consoleWarn.mock.calls[0][0]).not.toContain("test@example.com");
  });

  it("każde zdarzenie daje osobną linię - do pięciu w jednym żądaniu", async () => {
    const events = (["error", "unhandledrejection", "boundary", "fetch", "error"] as const).map((kind, index) =>
      event({ kind, message: `błąd ${index}` })
    );

    const response = await POST(postContext({ events }));

    expect(response.status).toBe(204);
    expect(warnLines().map((line) => line.event)).toEqual([
      "client.error",
      "client.unhandledrejection",
      "client.boundary",
      "client.fetch",
      "client.error",
    ]);
  });

  it("400 dla więcej niż pięciu zdarzeń, bez żadnej linii logu", async () => {
    const response = await POST(postContext({ events: Array.from({ length: 6 }, () => event()) }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [expect.objectContaining({ path: "events" })],
    });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("400 z details w kształcie ValidationIssue dla nieznanego `kind`", async () => {
    const response = await POST(postContext({ events: [event({ kind: "console" })] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: [expect.objectContaining({ path: "events.0.kind", message: expect.any(String) })],
    });
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("400 dla `message` dłuższego niż 500 znaków", async () => {
    const response = await POST(postContext({ events: [event({ message: "x".repeat(501) })] }));

    expect(response.status).toBe(400);
  });

  it("400 dla `stack` dłuższego niż 4000 znaków", async () => {
    const response = await POST(postContext({ events: [event({ stack: "x".repeat(4001) })] }));

    expect(response.status).toBe(400);
  });

  it("400 dla pustej listy zdarzeń", async () => {
    const response = await POST(postContext({ events: [] }));

    expect(response.status).toBe(400);
  });

  it("400 dla ciała, które nie jest JSON-em", async () => {
    const response = await POST(postContext(undefined, { raw: "to nie json" }));

    expect(response.status).toBe(400);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("413 dla ciała powyżej 16 KB, zanim cokolwiek trafi do logu", async () => {
    const raw = JSON.stringify({ events: [event({ message: "x".repeat(17 * 1024) })] });

    const response = await POST(postContext(undefined, { raw }));

    expect(response.status).toBe(413);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("413 już po nagłówku `content-length` powyżej 16 KB", async () => {
    const response = await POST(postContext(undefined, { headers: { "content-length": String(17 * 1024) } }));

    expect(response.status).toBe(413);
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
