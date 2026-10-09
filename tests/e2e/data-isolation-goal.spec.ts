import { expect, test, type APIRequestContext } from "@playwright/test";
import { signInSecondAccount } from "./helpers/second-account";

/**
 * risk: #4 (context/foundation/test-plan.md) — facet: cel dzienny. Żądanie nie niesie
 * identyfikatora (jeden wiersz `user_settings` na użytkownika), więc izolację wyznacza sesja i RLS:
 * B nie widzi celu A, a zapis B nie zmienia celu A. Wzorzec: seed.spec.ts, poziom API.
 *
 * Konto A dzieli cel z `daily-goal.spec.ts`; `workers: 1`, a test przywraca obu kontom cel sprzed
 * startu (także `null`), z asercją. Żądania zmieniające stan niosą `Origin` (`security.checkOrigin`).
 */

interface Restore {
  request: APIRequestContext;
  goal: number | null;
}

let origin: string;
let restores: Restore[] = [];

async function readGoal(request: APIRequestContext): Promise<number | null> {
  const res = await request.get("/api/user-settings");
  expect(res.status()).toBe(200);
  return (await res.json()).daily_calorie_goal;
}

async function writeGoal(request: APIRequestContext, goal: number | null) {
  return request.put("/api/user-settings", { headers: { Origin: origin }, data: { daily_calorie_goal: goal } });
}

test.afterEach(async () => {
  // Przywrócenie celu sprzed testu, każde z asercją; kontekst B zamykamy dopiero po nim.
  for (const { request, goal } of restores) {
    const res = await writeGoal(request, goal);
    expect(res.status(), "przywrócenie celu").toBe(200);
  }
  for (const { request } of restores.slice(1)) await request.dispose();
  restores = [];
});

test("użytkownik B nie widzi celu dziennego użytkownika A, a zapis B nie zmienia celu A", async ({
  page,
  playwright,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  origin = new URL(baseURL).origin;

  const requestA = page.request;
  const accountB = await signInSecondAccount(playwright, baseURL);
  const requestB = accountB.request;
  expect(accountB.userId, "B musi być innym kontem niż A").not.toBe(process.env.E2E_USERNAME_ID);

  // Cele sprzed testu - do przywrócenia w afterEach.
  restores = [
    { request: requestA, goal: await readGoal(requestA) },
    { request: requestB, goal: await readGoal(requestB) },
  ];

  // Dwie różne wartości z zakresu 500-10000, inne przy każdym przebiegu.
  const goalA = 500 + (Date.now() % 9000);
  const goalB = goalA + 1;
  test.info().annotations.push({ type: "test-data", description: `goalA=${goalA} goalB=${goalB}` });

  // A ustawia swój cel.
  expect((await writeGoal(requestA, goalA)).status()).toBe(200);

  // B zapisuje swój cel - po tej samej trasie, bez identyfikatora w żądaniu.
  expect((await writeGoal(requestB, goalB)).status()).toBe(200);

  // B czyta swój cel, nie cel A (kontrola pozytywna: B ma sesję i własny wiersz).
  expect(await readGoal(requestB)).toBe(goalB);

  // Zapis B nie nadpisał celu A.
  expect(await readGoal(requestA)).toBe(goalA);
});
