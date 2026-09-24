import { OpenRouterService } from "../api/openrouter.service";
import { OpenRouterError } from "../api/openrouter.types";
import type { ChatResponse, JSONSchema } from "../api/openrouter.types";

/** Granice akceptowanej wartości - te same, co w `caloriesValueSchema` i w checku migracji. */
const MIN_CALORIES = 0;
const MAX_CALORIES = 5000;

/** Schemat odpowiedzi modelu. Ustawiany raz, w konstruktorze - ten serwis pyta tylko o liczbę. */
const CALORIES_SCHEMA: JSONSchema = {
  type: "object",
  properties: {
    calories: {
      type: "number",
      description: "Szacowana wartość energetyczna całej opisanej porcji w kcal",
    },
  },
  required: ["calories"],
};

const SYSTEM_MESSAGE = `
Jesteś kalkulatorem wartości energetycznej posiłków. Na podstawie opisu posiłku i podanej ilości
szacujesz liczbę kilokalorii dla CAŁEJ opisanej porcji.

Zasady:
- Zwracasz wyłącznie obiekt JSON w formacie {"calories": <liczba>} i nic poza nim.
- NIGDY nie pokazujesz procesu myślenia, nie dodajesz komentarzy, jednostek ani wyjaśnień.
- "calories" to liczba całkowita z przedziału ${MIN_CALORIES}-${MAX_CALORIES} (kcal dla całej porcji).
- Jeśli ilość nie została podana, przyjmij typową pojedynczą porcję opisanego posiłku.
- Jeśli opis nie pozwala oszacować wartości, zwróć {"calories": null}. Nie zgaduj na chybił trafił.
`;

/**
 * Buduje klienta OpenRoutera pod wycenę kalorii.
 *
 * Osobna instancja, nie współdzielona z `AIService`: `responseFormat` jest w tym kliencie globalny,
 * więc jedna instancja na dwa różne kształty odpowiedzi kolidowałaby ze sobą.
 *
 * Brakujący `OPENROUTER_API_KEY` rzuca z konstruktora `OpenRouterService` zwykłym `Error`
 * (`openrouter.service.ts:44-48`). Zamieniamy go na `OpenRouterError`, żeby konfiguracja bez klucza
 * kończyła się w trasie tym samym 502 co klucz nieprawidłowy, a nie 500 z zewnętrznego catcha.
 */
function createEstimationClient(): OpenRouterService {
  try {
    return new OpenRouterService({
      apiKey: import.meta.env.OPENROUTER_API_KEY,
      timeout: 60_000, // pełna minuta, tyle co domyślnie; zejście niżej zbiera znacznie więcej nieudanych oszacowań
      // Dokładnie jedna próba i ani jednego powtórzenia. `retries` w tym kliencie liczy PRÓBY
      // (`while (attempt < this.retries)`, openrouter.service.ts:170), a `0` nie przechodzi przez
      // `config.retries || 2` w konstruktorze (:62) - cicho wróciłoby do dwóch prób i ~120 s.
      // Budżet ponawiania należy wyłącznie do przycisku "Policz ponownie", czyli do użytkownika.
      retries: 1,
    });
  } catch (error) {
    if (error instanceof OpenRouterError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "nieznany błąd";
    throw new OpenRouterError(`Konfiguracja OpenRouter jest niekompletna: ${message}`);
  }
}

/**
 * Jedyne miejsce, które rozmawia z modelem w sprawie kalorii.
 *
 * Bez zależności od Supabase - zapis należy do `DiaryService`. Serwis wyłącznie pyta model
 * i sprowadza jego odpowiedź do liczby albo do jej braku.
 */
export class CalorieEstimationService {
  private readonly openRouterService: OpenRouterService;

  constructor() {
    this.openRouterService = createEstimationClient();
    this.openRouterService.setResponseFormat(CALORIES_SCHEMA);
  }

  /**
   * Szacuje wartość energetyczną posiłku z jego opisu.
   *
   * Preferencje żywieniowe użytkownika NIE są wysyłane - do policzenia kalorii nic nie wnoszą,
   * a powiększałyby to, co opuszcza produkt.
   *
   * @param content - Opis posiłku wpisany przez użytkownika
   * @param amountText - Ilość podana przez użytkownika albo `null`
   * @returns Liczba całkowita z przedziału 0-5000 albo `null`, gdy odpowiedź modelu jest
   *   bezużyteczna (brak pola, wartość spoza zakresu, treść nie do sparsowania).
   * @throws {OpenRouterError} Gdy dostawca jest nieosiągalny albo odmówił (sieć, timeout, 401,
   *   429, 5xx). Te błędy celowo NIE są połykane: bez nich trasa nie miałaby z czego zbudować 502,
   *   a awaria dostawcy byłaby w logach nieodróżnialna od halucynacji modelu.
   */
  async estimateFromDescription(content: string, amountText: string | null): Promise<number | null> {
    const userMessage = [`Opis posiłku: ${content}`, `Ilość: ${amountText ?? "nie podano"}`].join("\n");

    const response = await this.openRouterService.sendMessage(userMessage, SYSTEM_MESSAGE);

    return this.extractCalories(response);
  }

  /**
   * Wydobywa liczbę z surowej koperty OpenAI.
   *
   * Schemat sam z siebie liczby nie gwarantuje: `processResponse` (`openrouter.service.ts:269`) to
   * goły rzut typu bez walidacji, a `response_format` idzie na wyjściu jako
   * `{ type: "json_object", schema }` (tamże, :136) - kształt, którego OpenRouter nie egzekwuje.
   * Model jest przy tym rozumujący, więc treść bywa poprzedzona preambułą i owinięta w ogrodzenia
   * markdown. `AIService` rozwiązuje to samo trzema prywatnymi metodami zaszytymi pod kształt
   * przepisu - nie ma czego zaimportować, więc te kilkanaście linii jest tu świadomie zdublowane.
   *
   * Każdy krok, który się nie uda, kończy się `null` - czyli "odpowiedź bezużyteczna", nie awarią
   * dostawcy.
   */
  private extractCalories(response: ChatResponse): number | null {
    const rawContent = response?.choices?.[0]?.message?.content;

    if (typeof rawContent !== "string" || rawContent.trim() === "") {
      return null;
    }

    // Najpierw ogrodzenie ```json ... ```, potem ostatni obiekt w treści: przy modelu rozumującym
    // pierwszy `{...}` bywa fragmentem rozważań, a wynik końcowy stoi na końcu.
    const fenced = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    let candidate: string | null = fenced ? fenced[1] : null;

    if (!candidate) {
      const objects = rawContent.match(/\{[\s\S]*?\}/g);
      candidate = objects && objects.length > 0 ? objects[objects.length - 1] : null;
    }

    if (!candidate) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null || !("calories" in parsed)) {
      return null;
    }

    const value = (parsed as { calories: unknown }).calories;

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.round(value);

    if (rounded < MIN_CALORIES || rounded > MAX_CALORIES) {
      return null;
    }

    return rounded;
  }
}
