import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { parseCalories } from "@/lib/utils/diary-calories";
import { AI_NOTICE } from "@/lib/utils/diary-estimation";
import { formatPortions } from "@/lib/utils/diary-portions";
import { resolveRecipeCalories, type RecipeCalorieResult } from "@/lib/utils/recipe-nutrition";
import { createDiaryEntrySchema, portionsSchema } from "@/lib/validations/diary/create-entry";
import type { DiaryEntryDto, RecipeDto } from "../../types";
import { useRecipeSearch } from "../../hooks/diary/useRecipeSearch";
import { useToast } from "../../hooks/common/useToast";

interface DiaryEntryFormProps {
  day: string;
  /**
   * Identyfikator dostaje tylko wpis zapisany przyciskiem "Zapisz i policz kalorie" - dla zwykłego
   * zapisu nie ma czego zlecać, więc argument zostaje pusty.
   */
  onCreated: (createdEntryId?: number) => void;
}

type DiaryFormField = "content" | "amount_text" | "calories" | "portions";

interface DiaryFormValues {
  content: string;
  amount_text: string;
  calories: string;
  /**
   * Liczba porcji jako tekst, dokładnie z tego powodu co `calories`: pole jest tekstowe, przyjmuje
   * przecinek jako separator dziesiętny, a `type="number"` zwraca pusty `value` dla wszystkiego,
   * co nie jest liczbą, i cicho gubi to, co użytkownik wpisał.
   */
  portions: string;
}

/**
 * Pola, które mają własne miejsce na komunikat przy inpucie. Schemat waliduje też `entry_date`,
 * którego formularz nie pokazuje - bez tej listy jego błąd trafiałby do stanu i nigdzie się nie
 * rysował, a przycisk po prostu przestawałby działać bez słowa wyjaśnienia.
 */
const FIELD_KEYS = ["content", "amount_text", "calories", "portions"];

const EMPTY_FORM: DiaryFormValues = {
  content: "",
  amount_text: "",
  calories: "",
  portions: "1",
};

/** Etykieta pola wyboru przepisu - w dwóch gałęziach układu, więc w jednym miejscu. */
const RECIPE_FIELD_LABEL = "Z mojego przepisu (opcjonalnie)";

/**
 * Zamiana tego, co użytkownik wpisał w pole porcji, na liczbę dla schematu.
 *
 * Ta sama ostrożność co w `parseCalories`: `Number` czyta więcej form liczby, niż to pole miało
 * kiedykolwiek przyjmować ("1e3" cicho robi się tysiącem porcji). Przepuszczamy więc wyłącznie
 * cyfry z opcjonalną częścią dziesiętną, a resztę zwracamy jako NaN - i celowo nie sprawdzamy tu
 * ani zakresu, ani liczby miejsc po przecinku, żeby to `portionsSchema` powiedziało, co dokładnie
 * jest nie tak. Parser mieszka przy formularzu, bo tylko on czyta to pole; `formatPortions` musiał
 * trafić do `src/lib/utils/`, bo czyta z niego także lista dnia.
 */
const parsePortions = (raw: string): number | null => {
  const trimmed = raw.trim();

  if (trimmed === "") return null;

  return /^[0-9]+([.,][0-9]+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : Number.NaN;
};

/**
 * Buduje dane wejściowe dla schematu z Fazy 1. Formularz zna tylko napisy, a schemat oczekuje
 * liczby albo `null` - puste pole kalorii to brak wartości, nie zero. Samą regułę czytania napisu
 * trzyma `src/lib/utils/diary-calories.ts`, wspólnie z polem przy wpisie na liście.
 *
 * Bez wybranego przepisu obie nowe wartości idą jako `null`, mimo że pole porcji trzyma wtedy swoje
 * domyślne "1": reguła wzajemna ze schematu odrzuciłaby porcje bez przepisu, i słusznie - wpis
 * opisowy opisuje ilość tekstem.
 */
const toPayload = (values: DiaryFormValues, day: string, recipe: RecipeDto | null) => ({
  entry_date: day,
  content: values.content,
  amount_text: values.amount_text,
  calories: parseCalories(values.calories),
  source_recipe_id: recipe === null ? null : recipe.id,
  portions: recipe === null ? null : parsePortions(values.portions),
});

/**
 * Podgląd wartości dla wybranego przepisu. Oba komunikaty o braku liczby kierują użytkownika po
 * zapisie, a nie do pola w formularzu: na tej ścieżce pola kalorii nie ma, a wpis ląduje w stanie
 * "Nie policzono", gdzie ma i aktywne pole na liczbę, i wycenę AI.
 */
function previewMessage(result: RecipeCalorieResult, portions: number): string {
  if (result.reason === "no_declared_block") {
    return "Ten przepis nie podaje wartości odżywczych na porcję — kalorie ustalisz po zapisaniu wpisu";
  }

  if (result.reason === "out_of_range") {
    return "Wartość dla tylu porcji przekracza 5000 kcal — kalorie ustalisz po zapisaniu wpisu";
  }

  return `≈ ${result.total} kcal — z przepisu, ${formatPortions(portions)}`;
}

/**
 * Formularz wpisu, zawsze widoczny nad listą: dziennik zapisuje się seriami, a modal kazałby
 * płacić otwarciem za każdy posiłek.
 *
 * Dwie ścieżki wejścia, jedna podłoga. Ścieżka opisowa zachowuje się dokładnie tak jak wcześniej;
 * wybór przepisu podmienia ilość tekstową na liczbę porcji i **chowa pole kalorii**. To drugie nie
 * jest kosmetyką: przy zapisie wygrywa liczba wpisana wprost, więc wartość zostawiona w tym polu
 * po cichu unieważniłaby całe wyliczenie - podgląd obiecywałby "≈ 750 kcal — z przepisu", a wpis
 * dostałby 300 i etykietę "wpisane ręcznie". Ręczna liczba nic nie traci: wpis przyjmuje ją
 * natychmiast po zapisaniu, polem przy wierszu listy, i wtedy etykieta uczciwie się zmienia.
 *
 * Walidacja po stronie klienta korzysta z tego samego schematu, co route POST, więc obie strony
 * nie mogą się rozjechać. Długość opisu i ilości ograniczamy też natywnie (`maxLength`): ten
 * atrybut przycina pisanie i wklejanie, ale nie wystawia dymka przerywającego `submit`, więc
 * komunikat przy polu nadal jest tym, co rozstrzyga. Kalorie zostają `type="text"`, bo
 * `type="number"` zwraca pusty `value` dla znaków, które nie są liczbą, i cicho gubi wpisane dane.
 */
export default function DiaryEntryForm({ day, onCreated }: DiaryEntryFormProps) {
  const [values, setValues] = useState<DiaryFormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeDto | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const { showToast } = useToast();

  // Po wyborze przepisu hasło wraca do pustego, więc hook przestaje pytać serwera i lista wyników
  // znika razem z polem wyszukiwania.
  const { recipes, total, isSearching, error: searchError } = useRecipeSearch(searchTerm);

  // Błąd pojedynczego pola wyciągamy z walidacji całości - schemat jest jednym źródłem reguł,
  // a indeksowanie go po nazwie pola zaciemniłoby różnicę między napisem a liczbą kalorii.
  const fieldError = (name: DiaryFormField, nextValues: DiaryFormValues): string | null => {
    const result = createDiaryEntrySchema.safeParse(toPayload(nextValues, day, selectedRecipe));

    if (result.success) return null;

    const issue = result.error.issues.find((item) => item.path[0] === name);

    return issue ? issue.message : null;
  };

  // Walidacja w czasie rzeczywistym tylko dla pól, które już raz zgłosiły błąd.
  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };

    setValues(nextValues);

    if (!errors[name]) return;

    const message = fieldError(name as DiaryFormField, nextValues);

    if (message) {
      setErrors((prev) => ({ ...prev, [name]: message }));
    } else {
      setErrors((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [name]: removed, ...rest } = prev;
        return rest;
      });
    }
  };

  /**
   * Wybór przepisu: tytuł ląduje w opisie (pole zostaje edytowalne), ilość tekstowa i kalorie
   * znikają razem ze swoimi wartościami, a na ich miejsce wchodzą porcje z domyślną jedynką.
   * Komunikaty czyścimy w całości, bo błąd pola, którego już nie widać, nie miałby się gdzie
   * narysować.
   */
  const handleSelectRecipe = (recipe: RecipeDto) => {
    setSelectedRecipe(recipe);
    setSearchTerm("");
    setValues((prev) => ({ ...prev, content: recipe.title, amount_text: "", calories: "", portions: "1" }));
    setErrors({});
  };

  /**
   * Usunięcie wyboru przywraca ilość tekstową i pole kalorii, ale **nie** rusza opisu: użytkownik
   * mógł go już poprawić, a skasowanie jego tekstu byłoby utratą pracy.
   */
  const handleClearRecipe = () => {
    setSelectedRecipe(null);
    setSearchTerm("");
    setValues((prev) => ({ ...prev, portions: "1" }));
    setErrors({});
  };

  /**
   * Zapis wpisu, z wyceną albo bez.
   *
   * Który przycisk kliknięto, rozstrzyga argument, a nie `event.submitter`: drugi przycisk jest
   * zwykłym `type="button"`, więc pierwszy zostaje jedynym domyślnym zatwierdzeniem formularza
   * i Enter w polu opisu nadal zapisuje wpis bez zlecania czegokolwiek modelowi.
   */
  const submitEntry = async (withEstimate: boolean) => {
    const result = createDiaryEntrySchema.safeParse(toPayload(values, day, selectedRecipe));

    if (!result.success) {
      const nextErrors: Record<string, string> = {};

      result.error.issues.forEach((issue) => {
        const field = issue.path[0];

        if (field) {
          nextErrors[field.toString()] = issue.message;
        }
      });

      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/diary-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Ważne dla przesyłania cookies z sesją
        body: JSON.stringify({
          entry_date: day,
          content: result.data.content,
          amount_text: result.data.amount_text ?? null,
          calories: result.data.calories ?? null,
          // Bez `calorie_origin`: pochodzenie wartości ustala serwer, także na tej ścieżce.
          source_recipe_id: result.data.source_recipe_id ?? null,
          portions: result.data.portions ?? null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const created: DiaryEntryDto = await response.json();

      // Czyścimy pola tutaj, a nie w efekcie reagującym na sukces - `react-hooks/set-state-in-effect`
      // odrzuca ten drugi wariant. Wybór przepisu znika razem z opisem: zostawiony przy pustym
      // opisie opisywałby wpis, którego już nie ma.
      setValues(EMPTY_FORM);
      setSelectedRecipe(null);
      setSearchTerm("");
      // Wpis pojawia się na liście natychmiast; wycena, jeśli zlecona, dolicza się do niego później.
      onCreated(withEstimate ? created.id : undefined);
      showToast("Wpis został dodany", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wystąpił błąd podczas dodawania wpisu";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    void submitEntry(false);
  };

  const formErrors = Object.entries(errors).filter(([key]) => !FIELD_KEYS.includes(key));

  // Podgląd liczy się w trakcie renderu i nigdy nie trafia do stanu: kopia w `useState` musiałaby
  // być odświeżana efektem, czego `react-hooks/set-state-in-effect` zabrania, a przy okazji mogłaby
  // pokazywać wartość dla poprzedniej liczby porcji.
  const parsedPortions = selectedRecipe === null ? null : parsePortions(values.portions);
  const previewPortions =
    parsedPortions !== null && portionsSchema.safeParse(parsedPortions).success ? parsedPortions : null;
  const previewText =
    selectedRecipe !== null && previewPortions !== null
      ? previewMessage(resolveRecipeCalories(selectedRecipe.content, previewPortions), previewPortions)
      : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card p-4 shadow-sm"
      data-testid="diary-entry-form"
      aria-label="Dodaj wpis do dziennika"
    >
      <div className="mb-4 space-y-2">
        {selectedRecipe !== null ? (
          <>
            <p className="text-sm font-medium">{RECIPE_FIELD_LABEL}</p>
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2"
              data-testid="diary-recipe-selected"
            >
              <span className="truncate text-sm">{selectedRecipe.title}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearRecipe}
                disabled={isSubmitting}
                data-testid="diary-recipe-clear-button"
              >
                Usuń wybór
              </Button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="diary-recipe-search" className="block text-sm font-medium">
              {RECIPE_FIELD_LABEL}
            </label>
            <input
              type="search"
              id="diary-recipe-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Zacznij pisać nazwę przepisu"
              autoComplete="off"
              disabled={isSubmitting}
              data-testid="diary-recipe-search-input"
            />
            {isSearching && <p className="text-xs text-muted-foreground">Szukam przepisów…</p>}
            {searchError && (
              <p role="alert" className="text-xs text-destructive">
                {searchError.message}
              </p>
            )}
            {recipes.length > 0 && (
              <ul className="divide-y rounded-md border border-input">
                {recipes.map((recipe) => (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectRecipe(recipe)}
                      className="w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
                      data-testid={`diary-recipe-result-${recipe.id}`}
                    >
                      {recipe.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {total > recipes.length && (
              <p className="text-xs text-muted-foreground">
                Pokazano {recipes.length} z {total} pasujących przepisów - doprecyzuj nazwę.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1 space-y-2">
          <label htmlFor="diary-content" className="block text-sm font-medium">
            Co zjadłeś? <span className="text-destructive">*</span>
          </label>
          <textarea
            id="diary-content"
            name="content"
            value={values.content}
            onChange={handleChange}
            className={`h-20 w-full rounded-md border px-3 py-2 text-sm ${
              errors.content ? "border-destructive bg-destructive/10" : "border-input bg-background"
            }`}
            maxLength={500}
            placeholder="Np. owsianka z bananem"
            disabled={isSubmitting}
            aria-invalid={!!errors.content}
            aria-describedby={errors.content ? "diary-content-error" : undefined}
            data-testid="diary-content-input"
          />
          {errors.content && (
            <p
              id="diary-content-error"
              role="alert"
              className="text-xs text-destructive"
              data-testid="diary-content-error"
            >
              {errors.content}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{values.content.length}/500</p>
        </div>

        {selectedRecipe === null ? (
          <>
            <div className="space-y-2 sm:w-40">
              <label htmlFor="diary-amount" className="block text-sm font-medium">
                Ilość
              </label>
              <input
                type="text"
                id="diary-amount"
                name="amount_text"
                value={values.amount_text}
                onChange={handleChange}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  errors.amount_text ? "border-destructive bg-destructive/10" : "border-input bg-background"
                }`}
                maxLength={100}
                placeholder="Np. 1 talerz"
                disabled={isSubmitting}
                aria-invalid={!!errors.amount_text}
                aria-describedby={errors.amount_text ? "diary-amount-error" : undefined}
                data-testid="diary-amount-input"
              />
              {errors.amount_text && (
                <p
                  id="diary-amount-error"
                  role="alert"
                  className="text-xs text-destructive"
                  data-testid="diary-amount-error"
                >
                  {errors.amount_text}
                </p>
              )}
            </div>

            <div className="space-y-2 sm:w-32">
              <label htmlFor="diary-calories" className="block text-sm font-medium">
                Kalorie
              </label>
              <input
                type="text"
                inputMode="numeric"
                id="diary-calories"
                name="calories"
                value={values.calories}
                onChange={handleChange}
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  errors.calories ? "border-destructive bg-destructive/10" : "border-input bg-background"
                }`}
                placeholder="kcal"
                disabled={isSubmitting}
                aria-invalid={!!errors.calories}
                aria-describedby={errors.calories ? "diary-calories-error" : undefined}
                data-testid="diary-calories-input"
              />
              {errors.calories && (
                <p
                  id="diary-calories-error"
                  role="alert"
                  className="text-xs text-destructive"
                  data-testid="diary-calories-error"
                >
                  {errors.calories}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2 sm:w-32">
            <label htmlFor="diary-portions" className="block text-sm font-medium">
              Liczba porcji <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              id="diary-portions"
              name="portions"
              value={values.portions}
              onChange={handleChange}
              className={`w-full rounded-md border px-3 py-2 text-sm ${
                errors.portions ? "border-destructive bg-destructive/10" : "border-input bg-background"
              }`}
              placeholder="Np. 1,5"
              disabled={isSubmitting}
              aria-invalid={!!errors.portions}
              aria-describedby={errors.portions ? "diary-portions-error" : undefined}
              data-testid="diary-portions-input"
            />
            {errors.portions && (
              <p
                id="diary-portions-error"
                role="alert"
                className="text-xs text-destructive"
                data-testid="diary-portions-error"
              >
                {errors.portions}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Informacja, nie błąd - stąd barwy tła i tekstu inne niż w komunikatach walidacji. */}
      {previewText && (
        <p
          className="mt-4 rounded-md border border-input bg-muted px-3 py-2 text-xs text-muted-foreground"
          data-testid="diary-recipe-preview"
        >
          {previewText}
        </p>
      )}

      {formErrors.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-testid="diary-form-error"
        >
          {formErrors.map(([key, message]) => (
            <p key={key}>{message}</p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedRecipe === null
            ? "Kalorie możesz zostawić puste - wpis zapisze się bez wartości."
            : "Kalorie policzy przepis - własną liczbę możesz wpisać przy wpisie na liście."}
        </p>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={isSubmitting} className="gap-2" data-testid="diary-submit-button">
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Dodawanie...
                </>
              ) : (
                "Dodaj wpis"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              // Wpisana liczba wyklucza wycenę: trasa `/estimate` i tak nie tknęłaby wartości, która
              // już jest, więc przycisk aktywny przy wypełnionym polu tylko obiecywałby coś,
              // czego nie zrobi. Przy wybranym przepisie pole jest puste, więc oba przyciski
              // zostają - wpis z przepisu bez rozpoznanego bloku ma tę samą ścieżkę wyceny co
              // wpis opisowy.
              disabled={isSubmitting || values.calories.trim() !== ""}
              onClick={() => void submitEntry(true)}
              className="gap-2"
              data-testid="diary-submit-estimate-button"
            >
              Zapisz i policz kalorie
            </Button>
          </div>
          <p className="text-right text-xs text-muted-foreground" data-testid="diary-ai-notice">
            {AI_NOTICE}
          </p>
        </div>
      </div>
    </form>
  );
}
