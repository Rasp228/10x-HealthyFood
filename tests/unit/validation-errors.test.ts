import { z } from "zod";
import { zodIssues, zodMessage } from "@/lib/utils/validation-errors";

const schema = z.object({
  email: z.email("Wprowadź poprawny adres email"),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków"),
  profile: z.object({
    age: z.number().min(18, "Wymagana pełnoletność"),
  }),
});

function errorFor(input: unknown): z.ZodError {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("Oczekiwano błędu walidacji");
  }
  return result.error;
}

describe("zodIssues", () => {
  it("zwraca jeden wpis na każdy błąd", () => {
    const issues = zodIssues(errorFor({ email: "nie-email", password: "krótkie", profile: { age: 10 } }));

    expect(issues).toHaveLength(3);
  });

  it("spłaszcza ścieżkę do notacji kropkowej", () => {
    const issues = zodIssues(errorFor({ email: "a@b.pl", password: "dostatecznie-dlugie", profile: { age: 10 } }));

    expect(issues).toEqual([{ path: "profile.age", message: "Wymagana pełnoletność" }]);
  });

  it("nie przepuszcza pól wewnętrznych Zoda do odpowiedzi", () => {
    const [issue] = zodIssues(errorFor({ email: "nie-email", password: "dostatecznie-dlugie", profile: { age: 20 } }));

    expect(Object.keys(issue)).toEqual(["path", "message"]);
  });

  it("obsługuje indeksy tablicowe w ścieżce", () => {
    const listSchema = z.object({ tags: z.array(z.string().min(1, "Tag nie może być pusty")) });
    const result = listSchema.safeParse({ tags: ["ok", ""] });
    if (result.success) throw new Error("Oczekiwano błędu walidacji");

    expect(zodIssues(result.error)).toEqual([{ path: "tags.1", message: "Tag nie może być pusty" }]);
  });
});

describe("zodMessage", () => {
  it("skleja błędy w jedną linię", () => {
    const message = zodMessage(errorFor({ email: "nie-email", password: "krótkie", profile: { age: 20 } }));

    expect(message).toBe("email: Wprowadź poprawny adres email, password: Hasło musi mieć co najmniej 8 znaków");
  });

  it("pomija pustą ścieżkę przy błędzie na poziomie korzenia", () => {
    const rootSchema = z.string("Oczekiwano tekstu");
    const result = rootSchema.safeParse(42);
    if (result.success) throw new Error("Oczekiwano błędu walidacji");

    expect(zodMessage(result.error)).toBe("Oczekiwano tekstu");
  });
});
