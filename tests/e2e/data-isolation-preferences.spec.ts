import { expect, test, type APIRequestContext } from "@playwright/test";
import { signInSecondAccount } from "./helpers/second-account";

/**
 * risk: #4 (context/foundation/test-plan.md) — facet: preferencje. B nie czyta, nie edytuje
 * i nie usuwa preferencji A przez trasy z prawdziwym Supabase (filtr po `user_id` w trasie + RLS).
 * Wzorzec: seed.spec.ts, poziom API.
 *
 * Preferencje A trafiają do promptu przepisu, więc preferencja testu żyje tylko w tym teście
 * i jest usuwana w afterEach, z asercją. Żądania zmieniające stan niosą `Origin`.
 */

interface Owned {
  request: APIRequestContext;
  id: number;
}

let origin: string;
let owned: Owned[] = [];
let requestB: APIRequestContext | undefined;

test.afterEach(async () => {
  // Każdą preferencję usuwa jej właściciel, z asercją.
  for (const { request, id } of owned) {
    const res = await request.delete(`/api/preferences/${id}`, { headers: { Origin: origin } });
    expect(res.status(), `sprzątanie preferencji ${id}`).toBe(204);
  }
  await requestB?.dispose();
  owned = [];
  requestB = undefined;
});

async function listIds(request: APIRequestContext): Promise<number[]> {
  const res = await request.get("/api/preferences?category=lubiane");
  expect(res.status()).toBe(200);
  return ((await res.json()).data as { id: number }[]).map(({ id }) => id);
}

test("użytkownik B nie czyta, nie edytuje i nie usuwa preferencji użytkownika A", async ({
  page,
  playwright,
  baseURL,
}) => {
  if (!baseURL) throw new Error("baseURL is not set in playwright.config.ts");
  origin = new URL(baseURL).origin;
  const token = `izolacja-${Date.now()}`;
  test.info().annotations.push({ type: "test-data", description: token });

  // A dodaje preferencję na swoim koncie.
  const requestA = page.request;
  const createdA = await requestA.post("/api/preferences", {
    headers: { Origin: origin },
    data: { category: "lubiane", value: `${token} A` },
  });
  expect(createdA.status()).toBe(201);
  const preferenceA = await createdA.json();
  owned.push({ request: requestA, id: preferenceA.id });

  // B loguje się we własnym kontekście i dodaje własną preferencję (kontrola pozytywna).
  const accountB = await signInSecondAccount(playwright, baseURL);
  requestB = accountB.request;
  expect(accountB.userId, "B musi być innym kontem niż A").not.toBe(preferenceA.user_id);
  const createdB = await requestB.post("/api/preferences", {
    headers: { Origin: origin },
    data: { category: "lubiane", value: `${token} B` },
  });
  expect(createdB.status()).toBe(201);
  const idB = (await createdB.json()).id;
  owned.push({ request: requestB, id: idB });

  // B widzi swoją preferencję, nie widzi preferencji A.
  const idsB = await listIds(requestB);
  expect(idsB).toContain(idB);
  expect(idsB).not.toContain(preferenceA.id);

  // B nie edytuje preferencji A: 404.
  const putB = await requestB.put(`/api/preferences/${preferenceA.id}`, {
    headers: { Origin: origin },
    data: { category: "nielubiane", value: `${token} przejęta` },
  });
  expect(putB.status()).toBe(404);

  // B nie usuwa preferencji A: 404.
  const deleteB = await requestB.delete(`/api/preferences/${preferenceA.id}`, { headers: { Origin: origin } });
  expect(deleteB.status()).toBe(404);

  // Stan z kontekstu A: preferencja istnieje bez zmian.
  const listA = await requestA.get("/api/preferences?category=lubiane");
  expect(listA.status()).toBe(200);
  const stored = ((await listA.json()).data as { id: number; category: string; value: string }[]).find(
    ({ id }) => id === preferenceA.id
  );
  expect(stored).toMatchObject({ category: "lubiane", value: `${token} A` });
});
