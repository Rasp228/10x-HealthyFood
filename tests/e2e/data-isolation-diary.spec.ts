import { expect, test, type APIRequestContext } from "@playwright/test";
import { signInSecondAccount } from "./helpers/second-account";

/**
 * risk: #4 (context/foundation/test-plan.md) — facet: wpisy dziennika, izolacja na prawdziwej bazie
 * dwoma kontami. Obronę w kodzie (cudzy `source_recipe_id`, DELETE przepisu) pilnują testy Jest
 * (`tests/unit/diary-entries-route.test.ts`, `tests/unit/recipes-route.test.ts`); tu sprawdzamy, że
 * B nie dosięga wpisu A przez trasy z prawdziwym Supabase, gdzie broni także RLS.
 * Wzorzec: seed.spec.ts. Poziom API, bez UI — ryzyko leży w trasach i bazie, nie w widoku.
 *
 * A = konto z `storageState` (projekt `setup`), B = drugie konto z `helpers/second-account.ts`.
 *
 * Data z przeszłości, żeby wpisy testu nie wchodziły do sumy „dzisiaj”, którą sprawdzają specy
 * dziennika. Każde żądanie zmieniające stan niesie `Origin` (`security.checkOrigin` w Astro).
 */

const ENTRY_DATE = "2020-01-15";

let origin: string;
let entryIdA: number | undefined;
let entryIdB: number | undefined;
let requestA: APIRequestContext | undefined;
let requestB: APIRequestContext | undefined;

test.afterEach(async () => {
  // Sprzątanie każdego wpisu przez jego właściciela, z asercją — cichy błąd zostawiłby wiersze w bazie.
  if (entryIdA !== undefined && requestA) {
    const res = await requestA.delete(`/api/diary-entries/${entryIdA}`, { headers: { Origin: origin } });
    expect(res.status(), "sprzątanie wpisu A").toBe(204);
  }
  if (entryIdB !== undefined && requestB) {
    const res = await requestB.delete(`/api/diary-entries/${entryIdB}`, { headers: { Origin: origin } });
    expect(res.status(), "sprzątanie wpisu B").toBe(204);
  }
  await requestB?.dispose();
  entryIdA = entryIdB = undefined;
  requestA = requestB = undefined;
});

test("użytkownik B nie czyta, nie edytuje i nie usuwa wpisu dziennika użytkownika A", async ({
  page,
  playwright,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  origin = new URL(baseURL).origin;
  const token = `izolacja-${Date.now()}`;
  test.info().annotations.push({ type: "test-data", description: token });

  // A tworzy wpis na swoim koncie (sesja z storageState).
  requestA = page.request;
  const createdA = await requestA.post("/api/diary-entries", {
    headers: { Origin: origin },
    data: { entry_date: ENTRY_DATE, content: `${token} A`, calories: 321 },
  });
  expect(createdA.status()).toBe(201);
  const entryA = await createdA.json();
  entryIdA = entryA.id;

  // B loguje się we własnym, czystym kontekście.
  const accountB = await signInSecondAccount(playwright, baseURL);
  requestB = accountB.request;
  expect(accountB.userId, "B musi być innym kontem niż A").not.toBe(entryA.user_id);

  // Kontrola pozytywna: B widzi własny wpis z tego dnia — pusta lista nie może wynikać z braku sesji B.
  const createdB = await requestB.post("/api/diary-entries", {
    headers: { Origin: origin },
    data: { entry_date: ENTRY_DATE, content: `${token} B`, calories: 123 },
  });
  expect(createdB.status()).toBe(201);
  entryIdB = (await createdB.json()).id;

  const listB = await requestB.get(`/api/diary-entries?date=${ENTRY_DATE}`);
  expect(listB.status()).toBe(200);
  const idsB = ((await listB.json()).data as { id: number }[]).map(({ id }) => id);
  expect(idsB).toContain(entryIdB);
  // B nie widzi wpisu A w liście dnia.
  expect(idsB).not.toContain(entryIdA);

  // B nie edytuje wpisu A: 404, jakby wpisu nie było.
  const patchB = await requestB.patch(`/api/diary-entries/${entryIdA}`, {
    headers: { Origin: origin },
    data: { content: `${token} przejęty przez B`, calories: 9 },
  });
  expect(patchB.status()).toBe(404);

  // B nie usuwa wpisu A: 404, nie sukces.
  const deleteB = await requestB.delete(`/api/diary-entries/${entryIdA}`, { headers: { Origin: origin } });
  expect(deleteB.status()).toBe(404);

  // Stan po operacjach, z kontekstu A: wpis istnieje z oryginalną treścią i wartością.
  const listA = await requestA.get(`/api/diary-entries?date=${ENTRY_DATE}`);
  expect(listA.status()).toBe(200);
  const stored = ((await listA.json()).data as { id: number; content: string; calories: number | null }[]).find(
    ({ id }) => id === entryIdA
  );
  expect(stored).toMatchObject({ content: `${token} A`, calories: 321 });
});
