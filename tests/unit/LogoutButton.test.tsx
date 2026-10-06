import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LogoutButton from "@/components/common/LogoutButton";

/**
 * Wyspa `LogoutButton` nie renderuje własnego przycisku - podpina obsługę pod
 * `<button id="logout-button">` z `TopNav.astro`. Test odtwarza ten układ: przycisk obok wyspy.
 *
 * `fetch` zamockowany na krawędzi przeglądarki (wzorzec `use-ai.test.tsx`); atrapa odpowiedzi to
 * zwykły obiekt `{ ok, status }`, bo jsdom nie dostarcza klasy `Response`.
 *
 * `window.location` w jsdom 26 (Jest 30) jest niekonfigurowalny: ani `Object.defineProperty(window,
 * "location", ...)`, ani `jest.spyOn(window.location, "replace")` nie przechodzą („Cannot redefine
 * property”). Publiczne `replace` deleguje jednak do obiektu implementacji ukrytego pod symbolem
 * `impl` - śledzimy więc tamten `replace`, a `restoreAllMocks` w `afterEach` zdejmuje atrapę.
 * Gdyby jsdom zmienił ten szczegół, `locationImpl` rzuca i czerwieni zwykły test sukcesu.
 */
interface LocationImpl {
  replace: (url: string) => void;
}

const fetchMock = jest.fn();
const originalFetch = global.fetch;
let replaceMock: jest.SpyInstance<void, [string]>;

function locationImpl(): LocationImpl {
  const symbol = Object.getOwnPropertySymbols(window.location).find((s) => s.description === "impl");
  if (!symbol) throw new Error("jsdom: brak obiektu implementacji pod window.location");
  return (window.location as unknown as Record<symbol, LocationImpl>)[symbol];
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  replaceMock = jest.spyOn(locationImpl(), "replace").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

/**
 * Klika „Wyloguj” i czeka, aż obsługa kliknięcia dobiegnie końca. Po rozstrzygnięciu `fetch`
 * reszta obsługi jest synchroniczna, więc jedno makrozadanie (`setTimeout(0)`) wypuszcza dopiero
 * wtedy, gdy wszystkie mikrozadania łańcucha już się wykonały - asercja nie wyprzedza handlera.
 */
async function clickLogoutAndSettle() {
  const user = userEvent.setup();

  render(
    <>
      <button id="logout-button">Wyloguj</button>
      <LogoutButton />
    </>
  );

  await user.click(document.getElementById("logout-button") as HTMLElement);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  await (fetchMock.mock.results[0].value as Promise<unknown>).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("LogoutButton - przekierowanie po wylogowaniu", () => {
  it("ok: true wysyła POST /api/auth/logout i dopiero potem przekierowuje na /auth/login", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await clickLogoutAndSettle();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/auth/login");
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(replaceMock.mock.invocationCallOrder[0]);
  });

  /**
   * Znany dług, opisany w `docs/reference/known-drift.md` („Wylogowanie”). Ekran logowania wolno
   * pokazać tylko po potwierdzonym wylogowaniu (plan `testing-session-and-access-boundaries`, D1),
   * a dziś wyspa przekierowuje także przy odpowiedzi `!ok` i przy błędzie sieci. Dlatego te testy są
   * `test.failing` - oczekiwana porażka zapisuje wyrocznię, nie obecne zachowanie. Po naprawie
   * zrobią się czerwone: zamień `test.failing` na `it` i usuń wpis z `known-drift.md`.
   */
  test.failing("ok: false (400 z trasy przy błędzie GoTrue) nie przekierowuje na /auth/login", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    await clickLogoutAndSettle();

    expect(replaceMock).not.toHaveBeenCalled();
  });

  /** Granica: żądanie nie dotarło, więc ciasteczko sesji zostaje nietknięte - sesja trwa za ekranem logowania. */
  test.failing("błąd sieci (fetch rzuca) nie przekierowuje na /auth/login", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await clickLogoutAndSettle();

    expect(replaceMock).not.toHaveBeenCalled();
  });
});
