/**
 * Reporter błędów przeglądarki - limity, deduplikacja, `AbortError` i jednokrotna rejestracja
 * handlerów. Stan reportera żyje w module, więc każdy test ładuje go od nowa.
 */

type Reporter = typeof import("@/lib/utils/client-error-reporter");

const sendBeacon = jest.fn<boolean, Parameters<Navigator["sendBeacon"]>>(() => true);

const loadReporter = async (): Promise<Reporter> => {
  jest.resetModules();
  return import("@/lib/utils/client-error-reporter");
};

/** Zdarzenia z każdego wysłanego ciała, w kolejności wysyłki. */
const sentEvents = () =>
  sendBeacon.mock.calls.flatMap(([, body]) => (JSON.parse(String(body)) as { events: { message: string }[] }).events);

beforeEach(() => {
  jest.useFakeTimers();
  sendBeacon.mockClear();
  Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true });
  delete (window as unknown as Record<string, unknown>).__healthyMealClientErrorReporter;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("reportClientError", () => {
  it("wysyła paczkę do /api/client-errors ze ścieżką strony i chwilą", async () => {
    const { reportClientError } = await loadReporter();

    reportClientError({ kind: "fetch", message: "HTTP 502 AI_UNAVAILABLE", source: "/api/diary-entries/1/estimate" });
    jest.runOnlyPendingTimers();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/client-errors");
    expect(sentEvents()).toEqual([
      expect.objectContaining({
        kind: "fetch",
        message: "HTTP 502 AI_UNAVAILABLE",
        source: "/api/diary-entries/1/estimate",
        path: window.location.pathname,
        at: expect.any(String),
      }),
    ]);
  });

  it("deduplikuje po message + source", async () => {
    const { reportClientError } = await loadReporter();

    reportClientError({ kind: "error", message: "boom", source: "a.js:1:1" });
    reportClientError({ kind: "error", message: "boom", source: "a.js:1:1" });
    reportClientError({ kind: "error", message: "boom", source: "b.js:1:1" });
    jest.runOnlyPendingTimers();

    expect(sentEvents()).toHaveLength(2);
  });

  it("wysyła najwyżej pięć zdarzeń na załadowanie strony", async () => {
    const { reportClientError } = await loadReporter();

    for (let index = 0; index < 8; index += 1) {
      reportClientError({ kind: "error", message: `błąd ${index}` });
      jest.runOnlyPendingTimers();
    }

    expect(sentEvents().map((event) => event.message)).toEqual(["błąd 0", "błąd 1", "błąd 2", "błąd 3", "błąd 4"]);
  });

  it("przycina ciało do limitu trasy", async () => {
    const { reportClientError } = await loadReporter();

    for (let index = 0; index < 5; index += 1) {
      reportClientError({ kind: "error", message: `błąd ${index}`, stack: "x".repeat(10_000) });
    }
    jest.runOnlyPendingTimers();

    const body = String(sendBeacon.mock.calls[0][1]);
    expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(16 * 1024);
    expect(sentEvents()).toHaveLength(5);
  });

  it("bez sendBeacon wysyła fetch z keepalive", async () => {
    Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true, writable: true });
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { reportClientError } = await loadReporter();

    reportClientError({ kind: "boundary", message: "render" });
    jest.runOnlyPendingTimers();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({ method: "POST", keepalive: true })
    );
  });
});

describe("installGlobalHandlers", () => {
  it("rejestruje handlery raz - drugie wywołanie nie podwaja zgłoszeń", async () => {
    const addEventListener = jest.spyOn(window, "addEventListener");
    const { installGlobalHandlers } = await loadReporter();

    installGlobalHandlers();
    installGlobalHandlers();

    expect(addEventListener.mock.calls.filter(([type]) => type === "unhandledrejection")).toHaveLength(1);
    addEventListener.mockRestore();
  });

  it("nie zgłasza AbortError odrzuconej obietnicy", async () => {
    const { installGlobalHandlers } = await loadReporter();
    const listeners: ((event: Event) => void)[] = [];
    const addEventListener = jest
      .spyOn(window, "addEventListener")
      .mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "unhandledrejection") listeners.push(listener as (event: Event) => void);
      });

    installGlobalHandlers();

    const rejection = (reason: unknown) => Object.assign(new Event("unhandledrejection"), { reason });
    listeners.forEach((listener) => listener(rejection(new DOMException("aborted", "AbortError"))));
    listeners.forEach((listener) => listener(rejection(new Error("probe"))));
    jest.runOnlyPendingTimers();

    expect(sentEvents()).toEqual([expect.objectContaining({ kind: "unhandledrejection", message: "probe" })]);
    addEventListener.mockRestore();
  });

  it("odrzucenie zwykłym obiektem wysyła typ i nazwy pól, bez wartości", async () => {
    const { installGlobalHandlers } = await loadReporter();
    const listeners: ((event: Event) => void)[] = [];
    const addEventListener = jest
      .spyOn(window, "addEventListener")
      .mockImplementation((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === "unhandledrejection") listeners.push(listener as (event: Event) => void);
      });

    installGlobalHandlers();

    const reason = { content: "owsianka z bananem", amount_text: "1 miska" };
    listeners.forEach((listener) => listener(Object.assign(new Event("unhandledrejection"), { reason })));
    jest.runOnlyPendingTimers();

    const [event] = sentEvents();
    expect(event.message).toContain("content, amount_text");
    expect(JSON.stringify(sentEvents())).not.toContain("owsianka");
    addEventListener.mockRestore();
  });
});
