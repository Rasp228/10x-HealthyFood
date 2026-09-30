import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import BaseModal from "@/components/ui/BaseModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { Textarea } from "@/components/ui/textarea";
import { formatCalories, parseCalories } from "@/lib/utils/diary-calories";
import { isAfter } from "@/lib/utils/diary-day";
import { AI_NOTICE, AI_NOTICE_RECIPE } from "@/lib/utils/diary-estimation";
import { formatPortionsInput, parsePortions } from "@/lib/utils/diary-portions";
import type { ValidationIssue } from "@/lib/utils/validation-errors";
import { updateDiaryEntrySchema } from "@/lib/validations/diary/update-entry";
import type { DiaryEntryDto } from "../../types";

interface DiaryEntryEditModalProps {
  entry: DiaryEntryDto | null;
  isOpen: boolean;
  /** Górna granica pola dnia - wpisu nie przenosi się w przyszłość, tak jak nie tworzy. */
  today: string;
  onClose: () => void;
  /** `recalculated` mówi wyspie, czy zlecono przeliczenie - tylko wtedy może chcieć kolejki wyceny. */
  onSaved: (entry: DiaryEntryDto, recalculated: boolean) => void;
}

type EditField = "content" | "amount_text" | "portions" | "calories" | "entry_date";

interface EditFormValues {
  content: string;
  amount_text: string;
  /** Tekst, nie liczba - z tych samych powodów co w `DiaryEntryForm`. */
  portions: string;
  calories: string;
  entry_date: string;
}

/**
 * Pola z własnym miejscem na komunikat. Wszystko spoza tej listy - w tym issue z `path: []` za
 * puste ciało - trafia do ogólnej ramki, żeby żaden błąd nie zniknął bez słowa.
 */
const FIELD_KEYS: readonly string[] = ["content", "amount_text", "portions", "calories", "entry_date"];

/** Końcówka `data-testid` pola i jego komunikatu - krótsza niż nazwa kolumny, jak w `DiaryEntryForm`. */
const TESTID_SUFFIX: Record<EditField, string> = {
  content: "content",
  amount_text: "amount",
  portions: "portions",
  calories: "calories",
  entry_date: "date",
};

/** Schemat nie zna "dziś" przeglądarki, więc tę jedną regułę pilnuje modal - jak przy tworzeniu. */
const FUTURE_DATE_MESSAGE = "Wpisu nie można przenieść na dzień w przyszłości";

const formFor = (entry: DiaryEntryDto | null): EditFormValues =>
  entry === null
    ? { content: "", amount_text: "", portions: "", calories: "", entry_date: "" }
    : {
        content: entry.content,
        amount_text: entry.amount_text ?? "",
        portions: formatPortionsInput(entry.portions),
        calories: formatCalories(entry.calories),
        entry_date: entry.entry_date,
      };

/**
 * Ciało `PATCH`: wyłącznie pola różne od zapisanego wiersza.
 *
 * To jest cała gwarancja, że "Zapisz" bez ruszania liczby nie dotyka pochodzenia - trasa zmienia
 * tylko to, co przyszło, więc niezmienione `calories` po prostu nie może pojechać. Porównania idą
 * po wartościach po odczycie (trim, pusty napis jako `null`), a do schematu trafia surowy napis
 * użytkownika, żeby komunikat mówił o tym, co faktycznie wpisał.
 *
 * Przy przeliczeniu `calories` nie jedzie wcale: schemat odrzuciłby parę, a przycisk i tak gaśnie,
 * gdy użytkownik wpisał liczbę.
 */
const toPayload = (values: EditFormValues, entry: DiaryEntryDto, recalculate: boolean) => {
  const payload: Record<string, unknown> = {};

  if (values.content.trim() !== entry.content) payload.content = values.content;

  // Kształt ilości wynika z wiersza: wpis z porcjami (także sierota po usuniętym przepisie) edytuje
  // liczbę porcji, wpis opisowy - tekst. Drugiego pola modal nie pokazuje, więc go nie wysyła.
  if (entry.portions !== null) {
    const portions = parsePortions(values.portions);

    if (portions !== entry.portions) payload.portions = portions;
  } else {
    const amount = values.amount_text.trim() === "" ? null : values.amount_text.trim();

    if (amount !== entry.amount_text) payload.amount_text = values.amount_text;
  }

  if (recalculate) {
    payload.recalculate = true;
  } else {
    const calories = parseCalories(values.calories);

    // NaN nie równa się niczemu, więc nieczytelny napis zawsze jedzie do schematu po komunikat.
    if (calories !== entry.calories) payload.calories = calories;
  }

  if (values.entry_date !== entry.entry_date) payload.entry_date = values.entry_date;

  return payload;
};

/**
 * Rozdziela issue po polach. Klient dostaje z Zoda ścieżkę jako tablicę, serwer w `details` jako
 * napis sklejony kropkami (`zodIssues`) - obie sprowadzamy do pierwszego segmentu.
 */
const toErrors = (issues: { path: string; message: string }[]): Record<string, string> => {
  const next: Record<string, string> = {};

  issues.forEach(({ path, message }) => {
    const field = path.split(".")[0];
    const key = FIELD_KEYS.includes(field) ? field : `form:${message}`;

    if (!next[key]) next[key] = message;
  });

  return next;
};

/**
 * Modal edycji wpisu dziennika.
 *
 * Dwa zapisy, jedna podłoga. "Zapisz" zmienia tylko to, co użytkownik zmienił - wartość i jej
 * pochodzenie stoją, dopóki sam nie wpisze albo nie wyczyści liczby. "Zapisz i przelicz" dokłada
 * `recalculate: true`: serwer zeruje wartość i od razu próbuje parsera przepisu, a gdy ten nic nie
 * ustali, wyspa kolejkuje wycenę. Przeliczenia nie ma bez jawnego kliknięcia, bo po cichu
 * skasowałoby liczbę poprawioną ręcznie (FR-004).
 *
 * Przepisu wpisu nie da się tu zmienić ani zamienić porcji na tekst ilości - zmiana przepisu to
 * nowy wpis.
 */
export default function DiaryEntryEditModal({ entry, isOpen, today, onClose, onSaved }: DiaryEntryEditModalProps) {
  const [values, setValues] = useState<EditFormValues>(() => formFor(entry));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formularz jest pochodną wpisu i tego, czy modal właśnie otwarto - zasiewamy go w trakcie
  // renderu, nie w efekcie ("adjusting state when props change", jak `RecipeFormModal.tsx:61-68`).
  const formKey = `${isOpen}:${entry?.id}`;
  const [prevFormKey, setPrevFormKey] = useState(formKey);

  if (prevFormKey !== formKey) {
    setPrevFormKey(formKey);
    setValues(formFor(entry));
    setErrors({});
    setIsSubmitting(false);
  }

  // Bez wpisu nie ma czego edytować, ale korzeń zostaje tym samym `BaseModal` - React go nie
  // odmontowuje, więc zamknięcie przechodzi przez jego gałąź `isOpen = false` i fokus wraca tam,
  // skąd modal otwarto.
  if (entry === null) {
    return (
      <BaseModal isOpen={false} onClose={onClose} data-testid="diary-edit-modal">
        {null}
      </BaseModal>
    );
  }

  /** Walidacja całości tym samym schematem co trasa `PATCH` plus reguła "nie w przyszłość". */
  const validate = (nextValues: EditFormValues, recalculate: boolean) => {
    const result = updateDiaryEntrySchema.safeParse(toPayload(nextValues, entry, recalculate));
    const issues = result.success
      ? []
      : result.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));

    if (nextValues.entry_date !== "" && isAfter(nextValues.entry_date, today)) {
      issues.push({ path: "entry_date", message: FUTURE_DATE_MESSAGE });
    }

    return { result, issues };
  };

  // Walidacja w czasie rzeczywistym tylko dla pól, które już raz zgłosiły błąd.
  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };

    setValues(nextValues);

    if (!errors[name]) return;

    const message = toErrors(validate(nextValues, false).issues)[name];

    setErrors((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [name]: removed, ...rest } = prev;

      return message ? { ...rest, [name]: message } : rest;
    });
  };

  const submit = async (recalculate: boolean) => {
    // „Zapisz” bez żadnej zmiany nie ma czego wysłać - zamyka modal jak „Anuluj”, zamiast
    // pokazywać błąd pustego ciała. „Zapisz i przelicz” zawsze niesie `recalculate`.
    if (!recalculate && Object.keys(toPayload(values, entry, false)).length === 0) {
      onClose();
      return;
    }

    const { result, issues } = validate(values, recalculate);

    if (!result.success || issues.length > 0) {
      setErrors(toErrors(issues));
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/diary-entries/${entry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Ważne dla przesyłania cookies z sesją
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        const errorData: { error?: string; details?: ValidationIssue[] } = await response.json().catch(() => ({}));

        // 400 z serwera - schemat albo `EntryShapeError` - ma `details` w kształcie `ValidationIssue`,
        // więc ląduje pod polami tak samo jak błąd złapany w przeglądarce.
        if (response.status === 400 && Array.isArray(errorData.details) && errorData.details.length > 0) {
          setErrors(toErrors(errorData.details));
        } else {
          const message = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
          setErrors({ [`form:${message}`]: message });
        }

        setIsSubmitting(false);
        return;
      }

      const updated: DiaryEntryDto = await response.json();

      setIsSubmitting(false);
      onSaved(updated, recalculate);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wystąpił błąd podczas zapisywania wpisu";

      setErrors({ [`form:${message}`]: message });
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    void submit(false);
  };

  // Zapis w toku nie może zostać porzucony w połowie - odpowiedź nie miałaby już komu się pokazać.
  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const formErrors = Object.entries(errors).filter(([key]) => !FIELD_KEYS.includes(key));
  // Liczba wpisana w modalu wyklucza przeliczenie - schemat odrzuciłby parę, a przycisk aktywny przy
  // takiej liczbie obiecywałby coś, czego nie zrobi. Wartość zasiana z wiersza się nie liczy:
  // przeliczenie ma ją właśnie zastąpić.
  const typedCalories = values.calories.trim() !== "" && values.calories.trim() !== formatCalories(entry.calories);
  const aiNotice = entry.source_recipe_id !== null ? AI_NOTICE_RECIPE : AI_NOTICE;
  const hasPortions = entry.portions !== null;

  const fieldProps = (field: EditField) => ({
    id: `diary-edit-${TESTID_SUFFIX[field]}`,
    name: field,
    value: values[field],
    onChange: handleChange,
    disabled: isSubmitting,
    "aria-invalid": !!errors[field],
    "aria-describedby": errors[field] ? `diary-edit-${TESTID_SUFFIX[field]}-error` : undefined,
    "data-testid": `diary-edit-${TESTID_SUFFIX[field]}-input`,
  });

  const fieldError = (field: EditField) =>
    errors[field] ? (
      <p
        id={`diary-edit-${TESTID_SUFFIX[field]}-error`}
        role="alert"
        className="text-xs text-destructive"
        data-testid={`diary-edit-${TESTID_SUFFIX[field]}-error`}
      >
        {errors[field]}
      </p>
    ) : null;

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title="Edytuj wpis" maxWidth="2xl" data-testid="diary-edit-modal">
      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Edytuj wpis dziennika">
        <div className="space-y-2">
          <Label htmlFor="diary-edit-content">
            Co zjadłeś? <span className="text-destructive">*</span>
          </Label>
          <Textarea {...fieldProps("content")} className="h-20" maxLength={500} />
          {fieldError("content")}
          <p className="text-xs text-muted-foreground">{values.content.length}/500</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {hasPortions ? (
            <div className="space-y-2">
              <Label htmlFor="diary-edit-portions">
                Liczba porcji <span className="text-destructive">*</span>
              </Label>
              <Input type="text" inputMode="decimal" placeholder="Np. 1,5" {...fieldProps("portions")} />
              {fieldError("portions")}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="diary-edit-amount">Ilość</Label>
              <Input type="text" maxLength={100} placeholder="Np. 1 talerz" {...fieldProps("amount_text")} />
              {fieldError("amount_text")}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="diary-edit-calories">Kalorie</Label>
            <Input type="text" inputMode="numeric" placeholder="kcal" {...fieldProps("calories")} />
            {fieldError("calories")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="diary-edit-date">Dzień</Label>
            <Input type="date" max={today} {...fieldProps("entry_date")} />
            {fieldError("entry_date")}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Puste pole kalorii zapisze wpis jako „Nie policzono”. Wartość i jej pochodzenie zmieniają się tylko wtedy, gdy
          sam je zmienisz albo zlecisz przeliczenie.
        </p>

        {formErrors.length > 0 && (
          <div
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-testid="diary-edit-form-error"
          >
            {formErrors.map(([key, message]) => (
              <p key={key}>{message}</p>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Anuluj
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void submit(true)}
              disabled={isSubmitting || typedCalories}
              data-testid="diary-edit-save-recalculate-button"
            >
              Zapisz i przelicz
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2" data-testid="diary-edit-save-button">
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Zapisywanie...
                </>
              ) : (
                "Zapisz"
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground sm:text-right" data-testid="diary-edit-ai-notice">
            {aiNotice}
          </p>
        </div>
      </form>
    </BaseModal>
  );
}
