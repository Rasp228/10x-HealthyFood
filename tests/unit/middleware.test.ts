/**
 * @jest-environment node
 *
 * Środowisko node, nie jsdom: middleware i atrapa `redirect` budują `Response`, którego jsdom
 * nie dostarcza. Middleware biegnie w produkcji po stronie serwera, więc node jest tu wierniejszy.
 */

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { onRequest } from "@/middleware/index";

/**
 * Wyrocznią jest wymaganie, nie kod: bez sesji dostępne są wyłącznie logowanie, rejestracja,
 * reset hasła i weryfikacja (PRD, `prd.md:230`), plus decyzje planu D2, D3, D7 i D8. Test celowo
 * nie importuje ani nie przepisuje listy ścieżek publicznych z middleware - sprawdza żądania.
 */

/**
 * `astro:middleware` to moduł wirtualny Vite, którego Jest nie rozwiąże. `defineMiddleware` jest
 * w nim tożsamością na typach, więc atrapa zwraca samą funkcję i test woła ją bezpośrednio.
 */
jest.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }), { virtual: true });

/**
 * Znacznik, który atrapa `flushCookies` dopisuje do odpowiedzi. Test czyta go z odpowiedzi
 * zwróconej przez middleware - tylko tak wiadomo, że ciasteczka sesji naprawdę z nią wyszły
 * (`context/foundation/lessons.md`). Sama asercja „funkcja wywołana” przepuściłaby wyjście, które
 * woła `flushCookies` na innej odpowiedzi niż ta zwracana.
 *
 * Nazwy z prefiksem `mock`, bo `jest.mock` jest wynoszony ponad deklaracje, a fabryka sięga po nie
 * dopiero przy wywołaniu.
 */
const mockCookieMarker = "sb-test-auth-token=rotated; Path=/; HttpOnly";
const mockGetUser = jest.fn();
const mockSignOut = jest.fn();
const mockExchangeCodeForSession = jest.fn();

/**
 * Middleware importuje `../db/supabase.client.ts`, a alias `@/db/supabase.client` rozwiązuje się
 * do tego samego pliku, więc ta atrapa podmienia moduł, który middleware faktycznie dostaje.
 * Prawdziwy moduł czyta `import.meta.env` - pod ts-jest (CommonJS) sam jego import wywróciłby plik.
 */
jest.mock("@/db/supabase.client", () => ({
  createSupabaseServerInstance: () => ({
    supabase: {
      auth: {
        getUser: mockGetUser,
        signOut: mockSignOut,
        exchangeCodeForSession: mockExchangeCodeForSession,
      },
    },
    flushCookies: <T extends Response>(response: T): T => {
      response.headers.append("Set-Cookie", mockCookieMarker);
      return response;
    },
  }),
}));

type MiddlewareContext = Parameters<typeof onRequest>[0];
type MiddlewareNext = Parameters<typeof onRequest>[1];

interface MiddlewareRun {
  response: Response;
  next: jest.Mock;
  locals: { user?: { id: string; email: string } };
}

/** Odpowiedź, którą zwraca dalsza część łańcucha - po niej poznajemy przepuszczenie. */
const PASSED_BODY = "strona-docelowa";

/** Woła middleware z ręcznie zbudowanym kontekstem, w kształcie, którego faktycznie dotyka. */
async function runMiddleware(pathWithQuery: string): Promise<MiddlewareRun> {
  const url = new URL(pathWithQuery, "http://localhost");
  const locals: MiddlewareRun["locals"] = {};
  const next = jest.fn(async () => new Response(PASSED_BODY, { status: 200 }));
  // Ten sam kształt co `redirect` w Astro 7 (`core/fetch/fetch-state.js`): `Location` trafia do
  // nagłówka bez kodowania, więc znak spoza Latin-1 wywraca konstruktor `Headers` tak samo jak
  // w produkcji. Atrapa, która by kodowała, ukryłaby błąd zamiast go pokazać.
  const redirect = (path: string) => new Response(null, { status: 302, headers: { Location: path } });

  const context = { locals, url, request: new Request(url), redirect } as unknown as MiddlewareContext;
  const response = (await onRequest(context, next as unknown as MiddlewareNext)) as Response;

  return { response, next, locals };
}

const signedOut = () => mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
const signedIn = (user: { id: string; email?: string }) =>
  mockGetUser.mockResolvedValue({ data: { user }, error: null });

const expectRedirectToLogin = ({ response, next }: MiddlewareRun) => {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe("/auth/login");
  expect(next).not.toHaveBeenCalled();
};

const expectPassedThrough = ({ response, next }: MiddlewareRun) => {
  expect(next).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(200);
  expect(response.headers.get("Location")).toBeNull();
};

/** Ścieżki wymagające sesji według wymagania i decyzji D2 (API) oraz D3 (`/api/health`). */
const PROTECTED_PATHS = [
  "/",
  "/diary",
  "/profile",
  "/recipes/new",
  "/recipes/1",
  "/recipes/edit/1",
  "/dev/diary-states",
  "/nie-ma-takiej-strony",
  "/api/diary-entries",
  "/api/diary-entries/1/estimate",
  "/api/user-settings",
  "/api/preferences",
  "/api/recipes/1",
  "/api/ai/generate-recipe",
  "/api/users/stats",
  "/api/health",
];

/** Logowanie, rejestracja, reset i weryfikacja - strony i ich endpointy; D7 dla zmiany hasła. */
const PUBLIC_REQUIREMENT_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/reset-password",
  "/auth/verify",
  "/auth/change-password",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/reset-password",
  "/api/auth/logout",
  "/api/auth/update-password",
  "/api/auth/me",
];

const PAGES_DIR = join(__dirname, "..", "..", "src", "pages");

/** Plik z `src/pages` jako URL: bez rozszerzenia, `index` → katalog, `[id]` / `[...x]` → `1`. */
function pageFileToUrl(file: string): string {
  const segments = relative(PAGES_DIR, file)
    .split(sep)
    .map((segment) => segment.replace(/\.(astro|ts)$/, ""))
    .map((segment) => (/^\[.+\]$/.test(segment) ? "1" : segment));

  if (segments[segments.length - 1] === "index") {
    segments.pop();
  }

  return `/${segments.join("/")}`;
}

/** Każdy plik strony lub trasy z drzewa, wraz z informacją, czy leży w katalogu uwierzytelniania. */
function routesFromPageTree(): { url: string; isAuthArea: boolean }[] {
  const authDirs = [join(PAGES_DIR, "auth") + sep, join(PAGES_DIR, "api", "auth") + sep];

  return readdirSync(PAGES_DIR, { recursive: true, encoding: "utf8" })
    .map((entry) => join(PAGES_DIR, entry))
    .filter((file) => /\.(astro|ts)$/.test(file))
    .map((file) => ({
      url: pageFileToUrl(file),
      isAuthArea: authDirs.some((dir) => file.startsWith(dir)),
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
  signedOut();
  mockSignOut.mockResolvedValue({ error: null });
  // Middleware loguje gałęzie błędów weryfikacji - w teście to szum, nie sygnał.
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("middleware - bez sesji, ścieżki chronione z wymagania", () => {
  it.each(PROTECTED_PATHS)("%s przekierowuje na /auth/login i nie przepuszcza żądania", async (path) => {
    expectRedirectToLogin(await runMiddleware(path));
  });
});

describe("middleware - bez sesji, ścieżki publiczne z wymagania", () => {
  it.each(PUBLIC_REQUIREMENT_PATHS)("%s przepuszcza żądanie bez przekierowania", async (path) => {
    expectPassedThrough(await runMiddleware(path));
  });
});

describe("middleware - zbiór z drzewa stron", () => {
  const routes = routesFromPageTree();

  it("mapowanie znajduje co najmniej tyle ścieżek, ile przypadków z wymagania", () => {
    // Pusta albo przycięta lista oznacza błąd mapowania, a nie zielony test.
    expect(routes.length).toBeGreaterThanOrEqual(PROTECTED_PATHS.length + PUBLIC_REQUIREMENT_PATHS.length);
    expect(routes.some((route) => route.isAuthArea)).toBe(true);
    expect(routes.some((route) => !route.isAuthArea)).toBe(true);
  });

  it.each(routes.filter((route) => !route.isAuthArea).map((route) => route.url))(
    "%s spoza katalogów auth wymaga sesji",
    async (url) => {
      expectRedirectToLogin(await runMiddleware(url));
    }
  );

  it.each(routes.filter((route) => route.isAuthArea).map((route) => route.url))(
    "%s z katalogów auth jest dostępna bez sesji",
    async (url) => {
      expectPassedThrough(await runMiddleware(url));
    }
  );
});

describe("middleware - dokładne dopasowanie ścieżki (D8)", () => {
  it.each(["/auth/login/", "/Auth/Login", "/auth/loginx", "/auth/login-cokolwiek"])(
    "%s nie jest ścieżką publiczną i przekierowuje dokładnie na /auth/login, bez pętli",
    async (path) => {
      expectRedirectToLogin(await runMiddleware(path));
    }
  );
});

describe("middleware - z sesją", () => {
  it("użytkownik z e-mailem przechodzi na chronioną ścieżkę, a locals.user niesie id i e-mail", async () => {
    signedIn({ id: "user-1", email: "jan@example.com" });

    const run = await runMiddleware("/diary");

    expectPassedThrough(run);
    expect(run.locals.user).toEqual({ id: "user-1", email: "jan@example.com" });
  });

  it("użytkownik bez e-maila na chronionej ścieżce dostaje przekierowanie", async () => {
    signedIn({ id: "user-1" });

    const run = await runMiddleware("/diary");

    expectRedirectToLogin(run);
    expect(run.locals.user).toBeUndefined();
  });
});

describe("middleware - każde wyjście niesie ciasteczka sesji", () => {
  const expectCookieMarker = (response: Response) => {
    expect(response.headers.get("Set-Cookie")).toContain(mockCookieMarker);
  };

  it("udana wymiana kodu weryfikacji przekierowuje na zmianę hasła z ciasteczkami", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    const { response, next } = await runMiddleware("/auth/verify?code=abc");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/change-password?verified=true");
    expect(next).not.toHaveBeenCalled();
    expectCookieMarker(response);
  });

  it("błąd wymiany kodu wylogowuje i przekierowuje z błędem, z ciasteczkami", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "zły kod" } });

    const { response, next } = await runMiddleware("/auth/verify?code=abc");

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/auth/verify?error=${encodeURIComponent("zły kod")}`);
    expect(next).not.toHaveBeenCalled();
    expectCookieMarker(response);
  });

  /**
   * Znany defekt (`docs/reference/known-drift.md`, „Middleware”): gałąź `catch` przekierowuje na
   * `/auth/verify?error=Wystąpił błąd…` z niezakodowanym tekstem, a `Location` z „ą” (kod 261) nie
   * przechodzi przez `Headers` - `TypeError: Cannot convert argument to a ByteString`. Zamiast 302
   * z ciasteczkami użytkownik dostaje 500. Ten sam konstruktor stoi w `redirect` Astro, więc to nie
   * artefakt atrapy.
   *
   * Ten `it` przypina **obecne zachowanie**. Po zakodowaniu komunikatu w middleware
   * (`encodeURIComponent`, jak w pozostałych gałęziach) zrobi się czerwony - wtedy go usuń.
   */
  it("wyjątek przy wymianie kodu dziś wywraca przekierowanie na niezakodowanym Location (obecne zachowanie)", async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error("sieć"));

    await expect(runMiddleware("/auth/verify?code=abc")).rejects.toThrow(/ByteString/);
  });

  /**
   * `it.failing` celowo: **wyrocznia** dla tego samego wyjścia - 302 na `/auth/verify?error=…`
   * z ciasteczkami. Po naprawie zrobi się czerwony - wtedy zamień go na zwykłe `it`.
   */
  it.failing("wyjątek przy wymianie kodu przekierowuje z błędem, z ciasteczkami", async () => {
    mockExchangeCodeForSession.mockRejectedValue(new Error("sieć"));

    const { response, next } = await runMiddleware("/auth/verify?code=abc");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/auth\/verify\?error=/);
    expect(next).not.toHaveBeenCalled();
    expectCookieMarker(response);
  });

  it("błąd w adresie weryfikacji wylogowuje i przekierowuje, z ciasteczkami", async () => {
    const { response, next } = await runMiddleware(
      "/auth/verify?error=access_denied&error_description=Link%20wygas%C5%82"
    );

    expect(mockSignOut).toHaveBeenCalled();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/auth/verify?error=${encodeURIComponent("Link wygasł")}`);
    expect(next).not.toHaveBeenCalled();
    expectCookieMarker(response);
  });

  it("przekierowanie gościa z chronionej ścieżki niesie ciasteczka", async () => {
    const run = await runMiddleware("/diary");

    expectRedirectToLogin(run);
    expectCookieMarker(run.response);
  });

  it("odpowiedź przepuszczonego żądania niesie ciasteczka", async () => {
    signedIn({ id: "user-1", email: "jan@example.com" });

    const run = await runMiddleware("/diary");

    expectPassedThrough(run);
    expect(await run.response.text()).toBe(PASSED_BODY);
    expectCookieMarker(run.response);
  });
});
