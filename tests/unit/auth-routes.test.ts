/**
 * @jest-environment node
 *
 * Środowisko node, nie domyślny jsdom: trasy budują `Response`, a jsdom tej klasy nie dostarcza.
 *
 * Trasy auth odróżniają błąd użytkownika od awarii GoTrue: odrzucenie danych (4xx) daje dzisiejszą
 * odpowiedź, limit (429) - 429 z ostrzeżeniem, a sieć, 5xx i błąd bez statusu - 503 z `requestId`
 * i linią błędu. Ciało, które nie jest JSON-em, to 400, nie 500. Błędy GoTrue są prawdziwymi
 * klasami z `@supabase/supabase-js`, bo klasyfikacja czyta ich `name` i `status`.
 */

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";
import { POST as login } from "@/pages/api/auth/login";
import { POST as register } from "@/pages/api/auth/register";
import { POST as resetPassword } from "@/pages/api/auth/reset-password";
import { POST as updatePassword } from "@/pages/api/auth/update-password";
import { classifyAuthError } from "@/lib/utils/auth-errors";

type Route = typeof login;
type RouteContext = Parameters<Route>[0];

const REQUEST_ID = "req-1";
const EMAIL = "jan.kowalski@example.com";
const STRONG_PASSWORD = "Haslo123!";

const RATE_LIMITED_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
const UNAVAILABLE_MESSAGE = "Usługa logowania jest chwilowo niedostępna. Spróbuj ponownie za chwilę.";

/** Atrapa `locals.supabase.auth` - tylko metody, których trasy dotykają. */
const auth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  updateUser: jest.fn(),
  getUser: jest.fn(),
};

const requestContext = (body: unknown, rawBody?: string) =>
  ({
    request: new Request("http://localhost/api/auth/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody ?? JSON.stringify(body),
    }),
    url: new URL("http://localhost/api/auth/test"),
    locals: { supabase: { auth }, requestId: REQUEST_ID },
  }) as unknown as RouteContext;

/** Sparsowane linie JSON wypisane przez szpiega konsoli. */
const logLines = (spy: jest.SpyInstance): Record<string, unknown>[] =>
  spy.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();

  auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: "user-1", email: EMAIL }, session: {} },
    error: null,
  });
  auth.signUp.mockResolvedValue({ data: { user: { id: "user-1", email: EMAIL }, session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: EMAIL } }, error: null });

  // W `beforeEach`, bo `jest.setup.ts` podmienia metody `console` w `beforeAll`.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

interface RouteCase {
  name: string;
  route: Route;
  /** Nazwa trasy w linii logu. */
  logRoute: string;
  /** Wywołanie GoTrue, którego błąd klasyfikujemy. */
  call: jest.Mock;
  body: unknown;
  /** Błąd, który GoTrue zgłasza przy złych danych, i dzisiejsza odpowiedź trasy na niego. */
  clientError: Error;
  clientStatus: number;
  clientMessage: string;
}

const ROUTES: RouteCase[] = [
  {
    name: "POST /api/auth/login",
    route: login,
    logRoute: "auth.login",
    call: auth.signInWithPassword,
    body: { email: EMAIL, password: STRONG_PASSWORD },
    clientError: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    clientStatus: 401,
    clientMessage: "Nieprawidłowy email lub hasło.",
  },
  {
    name: "POST /api/auth/register",
    route: register,
    logRoute: "auth.register",
    call: auth.signUp,
    body: { email: EMAIL, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD },
    clientError: new AuthApiError("User already registered", 422, "user_already_exists"),
    clientStatus: 409,
    clientMessage: "Email już zarejestrowany w systemie.",
  },
  {
    name: "POST /api/auth/reset-password",
    route: resetPassword,
    logRoute: "auth.reset_password",
    call: auth.resetPasswordForEmail,
    body: { email: EMAIL },
    clientError: new AuthApiError("Unable to validate email address: invalid format", 400, "validation_failed"),
    clientStatus: 400,
    clientMessage: "Wystąpił błąd podczas wysyłania linku resetującego",
  },
  {
    name: "POST /api/auth/update-password",
    route: updatePassword,
    logRoute: "auth.update_password",
    call: auth.updateUser,
    body: { password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD },
    // `AuthWeakPasswordError` to `CustomAuthError`, nie `AuthApiError` - a wciąż błąd klienta.
    clientError: new AuthWeakPasswordError("Password should be stronger", 422, ["characters"]),
    clientStatus: 400,
    clientMessage: "Hasło nie spełnia wymagań bezpieczeństwa.",
  },
];

describe.each(ROUTES)("$name", ({ route, logRoute, call, body, clientError, clientStatus, clientMessage }) => {
  it("client: odrzucenie danych przez GoTrue daje dzisiejszą odpowiedź, bez 429/503", async () => {
    call.mockResolvedValue({ data: { user: null, session: null }, error: clientError });

    const response = await route(requestContext(body));

    expect(response.status).toBe(clientStatus);
    await expect(response.json()).resolves.toEqual({ error: clientMessage });
    expect(logLines(consoleWarn)).toEqual([]);
  });

  it("rate_limited: 429 z GoTrue daje 429 z komunikatem i ostrzeżenie w logu", async () => {
    call.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"),
    });

    const response = await route(requestContext(body));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: RATE_LIMITED_MESSAGE });
    expect(logLines(consoleWarn)).toEqual([
      expect.objectContaining({
        level: "warn",
        event: "auth.rate_limited",
        requestId: REQUEST_ID,
        route: logRoute,
        error: expect.objectContaining({ status: 429 }),
      }),
    ]);
  });

  it("unavailable: awaria sieci GoTrue daje 503 z requestId i linię błędu bez e-maila", async () => {
    call.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });

    const response = await route(requestContext(body));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: UNAVAILABLE_MESSAGE, requestId: REQUEST_ID });

    const lines = logLines(consoleError);
    expect(lines).toEqual([
      expect.objectContaining({
        level: "error",
        event: "auth.unavailable",
        requestId: REQUEST_ID,
        route: logRoute,
        error: expect.objectContaining({ name: "AuthRetryableFetchError" }),
      }),
    ]);
    expect(consoleError.mock.calls[0][0]).not.toContain(EMAIL);
  });

  it("unavailable: 5xx z GoTrue też daje 503, nie odpowiedź dla złych danych", async () => {
    call.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError("Internal Server Error", 500, "unexpected_failure"),
    });

    const response = await route(requestContext(body));

    expect(response.status).toBe(503);
    expect(logLines(consoleError)).toEqual([expect.objectContaining({ event: "auth.unavailable" })]);
  });

  it("zły JSON daje 400, a nie 500, i nie woła GoTrue", async () => {
    const response = await route(requestContext(undefined, "to nie json"));

    expect(response.status).toBe(400);
    expect(call).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register - słabe hasło", () => {
  it("AuthWeakPasswordError (422, nie AuthApiError) zostaje błędem klienta", async () => {
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthWeakPasswordError("Password should be stronger", 422, ["characters"]),
    });

    const response = await register(
      requestContext({ email: EMAIL, password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Zbyt słabe hasło. Hasło musi spełniać wymagania bezpieczeństwa.",
    });
  });
});

describe("POST /api/auth/update-password - odczyt sesji", () => {
  const body = { password: STRONG_PASSWORD, confirmPassword: STRONG_PASSWORD };

  it("brak sesji daje 401 jak dotąd", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });

    const response = await updatePassword(requestContext(body));

    expect(response.status).toBe(401);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("awaria GoTrue przy odczycie sesji daje 503, nie 401", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });

    const response = await updatePassword(requestContext(body));

    expect(response.status).toBe(503);
    expect(logLines(consoleError)).toEqual([
      expect.objectContaining({ event: "auth.unavailable", step: "getUser", requestId: REQUEST_ID }),
    ]);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("classifyAuthError", () => {
  it.each([
    ["AuthApiError 400", new AuthApiError("Invalid login credentials", 400, "invalid_credentials"), "client"],
    ["AuthWeakPasswordError 422", new AuthWeakPasswordError("weak", 422, ["length"]), "client"],
    ["AuthSessionMissingError", new AuthSessionMissingError(), "client"],
    ["AuthApiError 429", new AuthApiError("rate limit", 429, "over_request_rate_limit"), "rate_limited"],
    ["AuthApiError 500", new AuthApiError("boom", 500, "unexpected_failure"), "unavailable"],
    ["AuthRetryableFetchError", new AuthRetryableFetchError("fetch failed", 0), "unavailable"],
    ["zwykły Error bez statusu", new Error("boom"), "unavailable"],
    ["obiekt z 400, który nie jest AuthError", { message: "?", status: 400 }, "unavailable"],
  ])("%s → %s", (_label, error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });
});
