import { z } from "zod";

/**
 * Sufity pól przepisu - literały kolumn `recipes` z `20250427130913_healthymeal_schema.sql`:
 * `title varchar(255)`, `content text check (char_length(content) <= 5000)` i
 * `additional_params text check (char_length(additional_params) <= 5000)`. Zmiana tutaj bez migracji
 * (albo odwrotnie) zamienia 400 w 500. Sufit tytułu w UI (100) jest celowo niższy i osobny.
 *
 * Bez `trim()`: poniżej sufitu trasa ma przyjmować i zapisywać tekst co do znaku tak jak przed
 * przeniesieniem schematu z trasy.
 */
export const recipeTitleSchema = z
  .string()
  .min(1, "Tytuł jest wymagany")
  .max(255, "Tytuł może mieć najwyżej 255 znaków");

export const recipeContentSchema = z
  .string()
  .min(1, "Treść przepisu jest wymagana")
  .max(5000, "Treść przepisu może mieć najwyżej 5000 znaków");

export const recipeAdditionalParamsSchema = z
  .string()
  .max(5000, "Dodatkowe parametry mogą mieć najwyżej 5000 znaków")
  .nullable()
  .optional();

/** Schemat ciała `POST /api/recipes`. */
export const createRecipeSchema = z.object({
  title: recipeTitleSchema,
  content: recipeContentSchema,
  additional_params: recipeAdditionalParamsSchema,
  is_ai_generated: z.boolean().optional().default(false),
});

export type CreateRecipeSchema = z.infer<typeof createRecipeSchema>;
