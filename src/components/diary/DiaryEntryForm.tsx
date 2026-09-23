import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { createDiaryEntrySchema } from "@/lib/validations/diary/create-entry";
import { useToast } from "../../hooks/common/useToast";

interface DiaryEntryFormProps {
  day: string;
  onCreated: () => void;
}

type DiaryFormField = "content" | "amount_text" | "calories";

interface DiaryFormValues {
  content: string;
  amount_text: string;
  calories: string;
}

/**
 * Pola, które mają własne miejsce na komunikat przy inpucie. Schemat waliduje też `entry_date`,
 * którego formularz nie pokazuje - bez tej listy jego błąd trafiałby do stanu i nigdzie się nie
 * rysował, a przycisk po prostu przestawałby działać bez słowa wyjaśnienia.
 */
const FIELD_KEYS = ["content", "amount_text", "calories"];

const EMPTY_FORM: DiaryFormValues = {
  content: "",
  amount_text: "",
  calories: "",
};

/**
 * Buduje dane wejściowe dla schematu z Fazy 1. Formularz zna tylko napisy, a schemat oczekuje
 * liczby albo `null` - puste pole kalorii to brak wartości, nie zero.
 */
/**
 * Puste pole to brak wartości, nie zero. Poza tym `Number` czyta więcej form liczby, niż to pole
 * kiedykolwiek miało przyjmować: "1e3" cicho robi się 1000 kcal, a "0x1f" - 31, i jedno i drugie
 * przechodzi potem każdą kontrolę schematu. Cyfry i tylko cyfry; wszystko inne zwracamy jako NaN,
 * żeby schemat odrzucił to tym samym komunikatem co "abc".
 */
const parseCalories = (raw: string): number | null => {
  const trimmed = raw.trim();

  if (trimmed === "") return null;

  return /^[0-9]{1,5}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

const toPayload = (values: DiaryFormValues, day: string) => ({
  entry_date: day,
  content: values.content,
  amount_text: values.amount_text,
  calories: parseCalories(values.calories),
});

/**
 * Formularz wpisu, zawsze widoczny nad listą: dziennik zapisuje się seriami, a modal kazałby
 * płacić otwarciem za każdy posiłek.
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
  const { showToast } = useToast();

  // Błąd pojedynczego pola wyciągamy z walidacji całości - schemat jest jednym źródłem reguł,
  // a indeksowanie go po nazwie pola zaciemniłoby różnicę między napisem a liczbą kalorii.
  const fieldError = (name: DiaryFormField, nextValues: DiaryFormValues): string | null => {
    const result = createDiaryEntrySchema.safeParse(toPayload(nextValues, day));

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const result = createDiaryEntrySchema.safeParse(toPayload(values, day));

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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Czyścimy pola tutaj, a nie w efekcie reagującym na sukces - `react-hooks/set-state-in-effect`
      // odrzuca ten drugi wariant.
      setValues(EMPTY_FORM);
      onCreated();
      showToast("Wpis został dodany", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wystąpił błąd podczas dodawania wpisu";
      showToast(message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formErrors = Object.entries(errors).filter(([key]) => !FIELD_KEYS.includes(key));

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border bg-card p-4 shadow-sm"
      data-testid="diary-entry-form"
      aria-label="Dodaj wpis do dziennika"
    >
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
      </div>

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

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">Kalorie możesz zostawić puste - wpis zapisze się bez wartości.</p>
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
      </div>
    </form>
  );
}
