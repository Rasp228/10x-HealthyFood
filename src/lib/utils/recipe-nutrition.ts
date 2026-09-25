/**
 * Odczyt kalorii na porcję z treści przepisu — i tylko z bloku, który sam deklaruje, że opisuje
 * porcję (FR-009).
 *
 * Cała interpretacja treści przepisu mieszka tutaj, bo czytają z niej dwa miejsca: serwis przy
 * zapisie wpisu i podgląd w formularzu. Dwie kopie reguł rozjechałyby się przy pierwszej korekcie,
 * a rozjazd byłby widoczny dopiero jako różnica między tym, co obiecał podgląd, a tym, co zapisała
 * baza.
 *
 * Ryzyko tego modułu jest asymetryczne: nierozpoznany blok spada do stanu „Nie policzono", który
 * interfejs już umie narysować, a błędnie odczytana liczba po cichu wchodzi do sumy dnia. Dlatego
 * rozpoznanie jest wąskie i zamknięte na listach, a nie zgadywane.
 */

/** Dlaczego wartości nie ma — formularz musi umieć powiedzieć użytkownikowi, co dalej. */
export type RecipeCalorieReason = "ok" | "no_declared_block" | "out_of_range";

export interface RecipeCalorieResult {
  /** Kalorie na jedną porcję odczytane z bloku; `null`, gdy bloku nie rozpoznano. */
  perPortion: number | null;
  /** Wartość dla wpisu: `perPortion * portions`, zaokrąglona. `null`, gdy nie ma czego zapisać. */
  total: number | null;
  reason: RecipeCalorieReason;
}

/**
 * Znacznik bloku odżywczego. Porównywany po normalizacji, więc wariant bez ogonków
 * (`Wartosci odzywcze`) trafia w ten sam wpis listy.
 */
const NUTRITION_MARKERS = ["wartosci odzywcze", "nutrition"];

/**
 * Rodzina słów, którą blok deklaruje, że opisuje **jedną porcję**. `porcj` pokrywa porcja/porcję/
 * porcji jednym wpisem.
 *
 * To jest cała decyzja produktowa tego modułu: blok bez takiego słowa (`Wartości odżywcze:`,
 * `Wartości odżywcze (całość)`) traktujemy jak nieobecny, bo nie wiadomo, ile jedzenia opisuje.
 * PRD zawęził FR-009 dokładnie tak — lepiej nie policzyć, niż policzyć kilkakrotnie za dużo.
 */
const PORTION_MARKERS = ["porcj", "serving", "portion"];

/** Zamknięta lista etykiet linii z kaloriami. Po normalizacji, więc bez ogonków. */
const CALORIE_LABELS = ["kalorycznosc", "kalorie", "calories", "energia", "energy"];

/**
 * Liczba opisana wprost jednostką `kcal` — ścieżka dla bloków, które nie nazywają wiersza etykietą,
 * tylko wypisują wartości ciągiem: `~450 kcal, 25g białka, 30g tłuszczów`.
 *
 * Ta forma jest częsta i ta aplikacja sama ją generuje, więc odrzucanie jej kosztowałoby
 * rozpoznanie tam, gdzie blok już przeszedł najostrzejszą bramkę — nagłówek sam zadeklarował, że
 * opisuje porcję. Jednostka `kcal` jest tu tym, czym gdzie indziej jest etykieta: mówi wprost, co
 * ta liczba znaczy. `kJ` nie może się tędy prześlizgnąć, bo wzorzec żąda dosłownie `kcal`.
 *
 * Ta ścieżka jest **drugim przebiegiem** po bloku, nigdy pierwszym: gdyby biegła linia po linii
 * razem z etykietą, `Tłuszcze: 12 g (108 kcal)` stojące nad `Kalorie: 250 kcal` wygrałoby.
 */
const KCAL_ANCHORED_NUMBER = /(\d+(?:[.,]\d+)?)\s*kcal/;

/**
 * Górna granica długości bloku. Blok odżywczy to kilka linii; dziesięć jest z dużym zapasem
 * i chroni przed sytuacją, w której brak pustej linii i brak nagłówka wciąga w blok cały przepis.
 */
const MAX_BLOCK_LINES = 10;

/**
 * Granica wartości wpisu — ta sama, którą `caloriesValueSchema`
 * (`src/lib/validations/diary/create-entry.ts`) nakłada na obie istniejące ścieżki. Powtórzona tu
 * jako liczby, a nie importowana ze schematu, bo ten moduł jest czysty i nie zna Zoda; rozjazd
 * wyłapałby test schematu i test parsera naraz.
 */
const MIN_TOTAL_CALORIES = 0;
const MAX_TOTAL_CALORIES = 5000;

/**
 * Małe litery i bez znaków diakrytycznych.
 *
 * Wszystkie dalsze operacje — szukanie etykiety, skanowanie liczb, wykrywanie `kJ` — biegną na
 * napisie znormalizowanym, nie na oryginale. Dzięki temu nie ma problemu z przesunięciem indeksów
 * między jedną a drugą postacią: cyfry i jednostki są i tak ASCII.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Czy linia jest nagłówkiem bloku samodeklarującego porcję: znacznik bloku **oraz** słowo z rodziny
 * porcji w tej samej linii.
 */
function isSelfDeclaringHeader(line: string): boolean {
  const normalized = normalize(line);

  return (
    NUTRITION_MARKERS.some((marker) => normalized.includes(marker)) &&
    PORTION_MARKERS.some((marker) => normalized.includes(marker))
  );
}

/**
 * Czy linia wygląda na nagłówek innej sekcji, czyli ucina blok.
 *
 * Sam dwukropek nie wystarcza: `Kalorie: 250 kcal` też go ma, tyle że w środku i z liczbą obok.
 * Stąd drugi warunek — brak cyfry. `Przygotowanie:` ucina, `Na 100 g:` nie.
 *
 * Predykat jest bliski heurystyce nagłówka z `src/components/ui/RecipeContent.tsx`, ale celowo nie
 * jest z niej importowany: tamta rysuje, ta liczy, i wolno im się rozejść.
 */
function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();

  return trimmed.endsWith(":") && !/\d/.test(trimmed);
}

/**
 * Pierwsza liczba w linii stojąca za etykietą i **nie** opisana jednostką `kJ`.
 *
 * `kJ` dyskwalifikuje liczbę, nie linię: bloki pisane z obu jednostek
 * (`Energia: 1046 kJ (250 kcal)`) są częste, a odrzucenie całej linii kosztowałoby rozpoznanie tam,
 * gdzie właściwa liczba stoi tuż obok. Tu leży jedyne w tym module ryzyko wyniku zawyżonego ~4×,
 * więc przeskakiwanie liczby z `kJ` jest jawne, a nie wynikowe.
 */
function readNumberAfter(normalizedLine: string, fromIndex: number): number | null {
  const numbers = /\d+(?:[.,]\d+)?/g;
  numbers.lastIndex = fromIndex;

  let match = numbers.exec(normalizedLine);

  while (match !== null) {
    const rest = normalizedLine.slice(match.index + match[0].length);

    if (!/^\s*kj/.test(rest)) {
      return Number(match[0].replace(",", "."));
    }

    match = numbers.exec(normalizedLine);
  }

  return null;
}

/** Indeks końca najwcześniejszej etykiety kalorycznej w linii; `null`, gdy żadnej nie ma. */
function findCalorieLabelEnd(normalizedLine: string): number | null {
  let earliestStart: number | null = null;
  let earliestEnd: number | null = null;

  for (const label of CALORIE_LABELS) {
    const start = normalizedLine.indexOf(label);

    if (start === -1) continue;

    if (earliestStart === null || start < earliestStart) {
      earliestStart = start;
      earliestEnd = start + label.length;
    }
  }

  return earliestEnd;
}

/**
 * Linie bloku odżywczego: od nagłówka **włącznie** (liczba bywa w tej samej linii) do pustej linii,
 * do nagłówka kolejnej sekcji albo do końca treści. Przy kilku pasujących nagłówkach liczy się
 * pierwszy.
 */
function collectBlockLines(content: string): string[] | null {
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex(isSelfDeclaringHeader);

  if (headerIndex === -1) return null;

  const block = [lines[headerIndex]];

  for (let index = headerIndex + 1; index < lines.length && block.length < MAX_BLOCK_LINES; index += 1) {
    const line = lines[index];

    if (line.trim() === "" || looksLikeHeading(line)) break;

    block.push(line);
  }

  return block;
}

/**
 * Kalorie na jedną porcję z treści przepisu albo `null`, gdy bloku samodeklarującego porcję nie ma
 * — albo gdy jest, ale nie niesie liczby.
 *
 * Z punktu widzenia kaskady kalorii blok bez liczby to blok, którego nie ma: jedno i drugie
 * prowadzi do wpisu bez wartości.
 */
export function readPerPortionCalories(content: string): number | null {
  const block = collectBlockLines(content);

  if (block === null) return null;

  const normalizedLines = block.map(normalize);

  // Przebieg pierwszy: linie z etykietą. Etykieta ma pierwszeństwo w CAŁYM bloku, nie tylko
  // w obrębie jednej linii - linia makroskładnika z kaloriami w nawiasie
  // (`Tłuszcze: 12 g (108 kcal)`) potrafi stać nad `Kalorie: 250 kcal`, a w jednym przebiegu
  // wygrywałaby jako pierwsza. Wynik byłby cichy i błędny: wpis dostaje pochodzenie
  // `recipe_nutrition`, więc ta liczba jest przedstawiana jako autorytatywna.
  for (const normalized of normalizedLines) {
    const labelEnd = findCalorieLabelEnd(normalized);

    if (labelEnd === null) continue;

    const labelled = readNumberAfter(normalized, labelEnd);

    if (labelled !== null) return labelled;
  }

  // Przebieg drugi: liczba opisana samą jednostką `kcal` - dopiero wtedy, gdy żadna linia bloku
  // nie nazwała się etykietą.
  for (const normalized of normalizedLines) {
    const anchored = KCAL_ANCHORED_NUMBER.exec(normalized);

    if (anchored !== null) return Number(anchored[1].replace(",", "."));
  }

  return null;
}

/**
 * Wartość dla wpisu dziennika: kalorie na porcję przemnożone przez liczbę zjedzonych porcji.
 *
 * Trzy wyniki, nie dwa, bo formularz musi umieć powiedzieć **dlaczego** wartości nie ma, a S-04
 * (oszacowanie z treści przepisu) musi umieć rozpoznać przypadek, w którym wchodzi jej ścieżka —
 * to `no_declared_block`, nie `out_of_range`.
 *
 * Przy `out_of_range` `perPortion` zostaje zachowane: formularz ma wtedy co pokazać w komunikacie,
 * a użytkownik widzi, że problem jest w liczbie porcji, nie w przepisie.
 */
export function resolveRecipeCalories(content: string, portions: number): RecipeCalorieResult {
  const perPortion = readPerPortionCalories(content);

  if (perPortion === null) {
    return { perPortion: null, total: null, reason: "no_declared_block" };
  }

  const total = Math.round(perPortion * portions);

  if (!Number.isFinite(total) || total < MIN_TOTAL_CALORIES || total > MAX_TOTAL_CALORIES) {
    return { perPortion, total: null, reason: "out_of_range" };
  }

  return { perPortion, total, reason: "ok" };
}
