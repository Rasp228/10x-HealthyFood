import { CalorieEstimationService } from "@/lib/services/calorie-estimation.service";
import { OpenRouterService } from "@/lib/api/openrouter.service";
import { OpenRouterError, RateLimitError } from "@/lib/api/openrouter.types";
import type { ChatResponse } from "@/lib/api/openrouter.types";

/**
 * Dostawca modelu jest zamockowany w całości: suita ma być deterministyczna i nie płacić za
 * wywołania w CI. Fabryka nie odwołuje się do niczego spoza swojego zakresu, bo `jest.mock` jest
 * wynoszony ponad importy - zmienna z zewnątrz byłaby w tym momencie jeszcze nieistniejąca.
 *
 * Mockowanie tego modułu ma drugi skutek, bez którego ten plik w ogóle by się nie uruchomił:
 * `openrouter.service.ts` czyta `import.meta.env`, a ts-jest kompiluje moduły do CommonJS, gdzie
 * `import.meta` jest błędem składni. Zamockowany moduł nie jest ładowany, więc problem znika.
 */
jest.mock("@/lib/api/openrouter.service", () => ({
  OpenRouterService: jest.fn(),
}));

const OpenRouterServiceMock = OpenRouterService as unknown as jest.Mock;

const sendMessage = jest.fn();
const setResponseFormat = jest.fn();

/** Koperta odpowiedzi OpenAI z podaną treścią wiadomości modelu. */
const chatResponse = (content: string): ChatResponse => ({
  id: "resp-1",
  model: "model-testowy",
  created: 1_700_000_000,
  choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});

/** Konfiguracja, z jaką serwis zbudował swojego klienta. */
const clientConfig = (): Record<string, unknown> => OpenRouterServiceMock.mock.calls[0][0] as Record<string, unknown>;

/** Wiadomość użytkownika przekazana dostawcy. */
const userMessageSent = (): string => sendMessage.mock.calls[0][0] as string;

/** Wiadomość systemowa przekazana dostawcy. */
const systemMessageSent = (): string => sendMessage.mock.calls[0][1] as string;

/** Wynik wyceny dla odpowiedzi modelu o podanej treści. */
const estimateFor = (content: string, amountText: string | null = null): Promise<number | null> => {
  sendMessage.mockResolvedValue(chatResponse(content));

  return new CalorieEstimationService().estimateFromDescription("frytki", amountText);
};

beforeEach(() => {
  jest.clearAllMocks();
  OpenRouterServiceMock.mockImplementation(() => ({ sendMessage, setResponseFormat }));
});

describe("CalorieEstimationService", () => {
  describe("konfiguracja klienta", () => {
    it("daje wywołaniu dokładnie jedną próbę - `retries: 1` znaczy w tym kliencie 'bez powtórzeń'", () => {
      // Wartość łatwa do cichego cofnięcia: `retries` liczy tu PRÓBY, a `0` przechodzi przez
      // `config.retries || 2` i wraca do dwóch. Budżet ponawiania należy do przycisku
      // "Policz ponownie", czyli do użytkownika.
      new CalorieEstimationService();

      expect(clientConfig().retries).toBe(1);
    });

    it("zostawia wywołaniu pełną minutę", () => {
      new CalorieEstimationService();

      expect(clientConfig().timeout).toBe(60_000);
    });

    it("buduje własną instancję klienta, nie współdzieli jej z AIService", () => {
      new CalorieEstimationService();
      new CalorieEstimationService();

      expect(OpenRouterServiceMock).toHaveBeenCalledTimes(2);
    });

    it("nie ustawia schematu odpowiedzi - domyślny model i tak go ignoruje, a psuł treść", () => {
      new CalorieEstimationService();

      expect(setResponseFormat).not.toHaveBeenCalled();
    });

    it("zamienia brak klucza na OpenRouterError, żeby trasa zbudowała z tego 502, a nie 500", () => {
      OpenRouterServiceMock.mockImplementation(() => {
        throw new Error("Klucz API jest wymagany - podaj go w konfiguracji lub ustaw zmienną OPENROUTER_API_KEY");
      });

      expect(() => new CalorieEstimationService()).toThrow(OpenRouterError);
    });

    it("przepuszcza OpenRouterError z konstruktora klienta bez owijania go drugi raz", () => {
      const original = new RateLimitError();
      OpenRouterServiceMock.mockImplementation(() => {
        throw original;
      });

      expect(() => new CalorieEstimationService()).toThrow(original);
    });
  });

  describe("prompt", () => {
    it("dokleja ilość do opisu", async () => {
      sendMessage.mockResolvedValue(chatResponse('{"calories": 420}'));

      await new CalorieEstimationService().estimateFromDescription("frytki", "około 200 g");

      expect(userMessageSent()).toContain("Opis posiłku: frytki");
      expect(userMessageSent()).toContain("Ilość: około 200 g");
    });

    it("mówi wprost, że ilości nie podano, zamiast milczeć o niej", async () => {
      sendMessage.mockResolvedValue(chatResponse('{"calories": 420}'));

      await new CalorieEstimationService().estimateFromDescription("frytki", null);

      expect(userMessageSent()).toContain("Ilość: nie podano");
    });

    it("wysyła wyłącznie opis i ilość - preferencje żywieniowe użytkownika nie opuszczają produktu", async () => {
      sendMessage.mockResolvedValue(chatResponse('{"calories": 420}'));

      await new CalorieEstimationService().estimateFromDescription("frytki", "około 200 g");

      // Równość, nie `toContain`: to jedyna asercja, która pilnuje, że do promptu nic więcej
      // nie doszło. Serwis nie ma zależności od Supabase i nie ma skąd wziąć preferencji -
      // ten test przypina, że nikt mu jej nie doda bez zauważenia.
      expect(userMessageSent()).toBe("Opis posiłku: frytki\nIlość: około 200 g");
      expect(systemMessageSent()).not.toMatch(/preferencj/i);
    });
  });

  describe("liczba wraca z odpowiedzi", () => {
    it("przyjmuje czysty obiekt JSON", async () => {
      await expect(estimateFor('{"calories": 420}')).resolves.toBe(420);
    });

    it("przyjmuje zero jako wartość brzegową", async () => {
      await expect(estimateFor('{"calories": 0}')).resolves.toBe(0);
    });

    it("przyjmuje 5000 jako wartość brzegową", async () => {
      await expect(estimateFor('{"calories": 5000}')).resolves.toBe(5000);
    });

    it("radzi sobie z odpowiedzią owiniętą w ogrodzenia ```json", async () => {
      const content = '```json\n{"calories": 640}\n```';

      await expect(estimateFor(content)).resolves.toBe(640);
    });

    it("radzi sobie z ogrodzeniem bez nazwy języka", async () => {
      const content = '```\n{"calories": 640}\n```';

      await expect(estimateFor(content)).resolves.toBe(640);
    });

    it("bierze ostatni obiekt, gdy rozumujący model poprzedził wynik preambułą", async () => {
      // Pierwszy `{...}` bywa fragmentem rozważań, a wynik końcowy stoi na końcu treści.
      const content = 'Policzmy: frytki to {"szacunek": 250} na 100 g.\nOstatecznie: {"calories": 500}';

      await expect(estimateFor(content)).resolves.toBe(500);
    });

    it("woła dostawcę dokładnie raz", async () => {
      await estimateFor('{"calories": 420}');

      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("zaokrąglanie", () => {
    it("zaokrągla ułamek do najbliższej liczby całkowitej", async () => {
      await expect(estimateFor('{"calories": 419.4}')).resolves.toBe(419);
    });

    it("zaokrągla połówkę w górę", async () => {
      await expect(estimateFor('{"calories": 419.5}')).resolves.toBe(420);
    });

    it("przepuszcza 5000.4, bo po zaokrągleniu mieści się w zakresie", async () => {
      await expect(estimateFor('{"calories": 5000.4}')).resolves.toBe(5000);
    });

    it("odrzuca 5000.6, bo po zaokrągleniu wychodzi poza zakres", async () => {
      await expect(estimateFor('{"calories": 5000.6}')).resolves.toBeNull();
    });
  });

  describe("odpowiedź bezużyteczna daje null, a nie wyjątek", () => {
    it("odrzuca wartość powyżej sufitu", async () => {
      await expect(estimateFor('{"calories": 5001}')).resolves.toBeNull();
    });

    it("odrzuca wartość ujemną", async () => {
      await expect(estimateFor('{"calories": -1}')).resolves.toBeNull();
    });

    it("odrzuca brak pola calories", async () => {
      await expect(estimateFor('{"kcal": 300}')).resolves.toBeNull();
    });

    it("odrzuca jawne null, które sam prompt dopuszcza przy nieopisowej treści", async () => {
      await expect(estimateFor('{"calories": null}')).resolves.toBeNull();
    });

    it("odrzuca wartość podaną jako napis", async () => {
      await expect(estimateFor('{"calories": "420"}')).resolves.toBeNull();
    });

    it("odrzuca treść bez żadnego obiektu", async () => {
      await expect(estimateFor("Nie jestem w stanie tego oszacować.")).resolves.toBeNull();
    });

    it("odrzuca obiekt nie do sparsowania", async () => {
      await expect(estimateFor("{calories: 420}")).resolves.toBeNull();
    });

    it("odrzuca pustą treść", async () => {
      await expect(estimateFor("   ")).resolves.toBeNull();
    });

    it("odrzuca kopertę bez wyborów", async () => {
      sendMessage.mockResolvedValue({ ...chatResponse('{"calories": 420}'), choices: [] });

      await expect(new CalorieEstimationService().estimateFromDescription("frytki", null)).resolves.toBeNull();
    });
  });

  describe("awaria dostawcy to co innego niż odpowiedź bezużyteczna", () => {
    it("wypuszcza OpenRouterError na zewnątrz zamiast zamieniać go na null", async () => {
      // Na tej granicy stoi 502 z trasy: bez niej awaria dostawcy byłaby w logach
      // nieodróżnialna od halucynacji modelu.
      sendMessage.mockRejectedValue(new RateLimitError());

      await expect(new CalorieEstimationService().estimateFromDescription("frytki", null)).rejects.toThrow(
        OpenRouterError
      );
    });

    it("woła dostawcę dokładnie raz także wtedy, gdy wywołanie kończy się błędem", async () => {
      sendMessage.mockRejectedValue(new RateLimitError());

      await expect(new CalorieEstimationService().estimateFromDescription("frytki", null)).rejects.toThrow();

      expect(sendMessage).toHaveBeenCalledTimes(1);
    });
  });
});
