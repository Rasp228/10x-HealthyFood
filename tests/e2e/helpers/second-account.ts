import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";

/**
 * Drugie konto testowe (B) dla speców izolacji danych między użytkownikami (ryzyko #4).
 *
 * Konto A to sesja z `storageState` (projekt `setup`). B loguje się przez `POST /api/auth/login`
 * we własnym, czystym kontekście żądań, więc nie dzieli ciasteczek z A. B nigdy się nie wylogowuje:
 * `signOut()` jest globalne, a kontekst i tak znika razem z testem (`dispose()`).
 */
export interface SecondAccount {
  request: APIRequestContext;
  userId: string;
}

export async function signInSecondAccount(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string
): Promise<SecondAccount> {
  const email = process.env.E2E_USERNAME_B;
  const password = process.env.E2E_PASSWORD_B;
  if (!email || !password) {
    throw new Error("Set E2E_USERNAME_B and E2E_PASSWORD_B in .env.test (second test account for risk #4)");
  }

  const request = await playwright.request.newContext({ baseURL });
  const login = await request.post("/api/auth/login", {
    headers: { Origin: new URL(baseURL).origin },
    data: { email, password },
  });
  expect(login.status(), "logowanie konta B").toBe(200);

  return { request, userId: (await login.json()).user.id };
}
