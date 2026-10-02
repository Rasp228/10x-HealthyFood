import { z } from "zod";

/**
 * Schemat parametrów listowania przepisów.
 *
 * `sort`, `order` i `search` są tu od początku istnienia ekranu przepisów. `search_field` i `limit`
 * dołożyła ścieżka dziennika (FR-007) i oba są **addytywne**: wywołanie bez nich musi zachować się
 * co do znaku tak jak przed zmianą.
 */
export const listRecipesSchema = z.object({
  sort: z.enum(["created_at", "updated_at", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  // Sufit i zakaz NUL zamieniają 500 na 400: w gałęzi `or()` termin powtarza się trzy razy w adresie
  // PostgREST (bardzo długi kończy się 414), a `\u0000` odrzuca PostgreSQL w typie `text`.
  search: z
    .string()
    .max(200, "Wyszukiwana fraza może mieć najwyżej 200 znaków")
    .refine((value) => !value.includes("\u0000"), "Wyszukiwana fraza zawiera niedozwolony znak")
    .optional(),
  // Zawężenie wyszukiwania do nazwy przepisu - ścieżka dziennika (FR-007). Jedna wartość
  // w enumie z rozmysłem: ekran przepisów nie podaje tego parametru i nic dla niego nie zmienia.
  search_field: z.enum(["title"]).optional(),
  // Koercja, bo parametry adresu przychodzą jako tekst. Sufit 50 chroni odpowiedź przed
  // wielkością, której podpowiedzi w dzienniku i tak nie pokażą.
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type ListRecipesSchema = z.infer<typeof listRecipesSchema>;
