import { z } from "zod";
import { recipeAdditionalParamsSchema, recipeContentSchema, recipeTitleSchema } from "./create-recipe";

/**
 * Schemat ciała `PUT /api/recipes/:id` - cały przepis, te same pola i sufity co przy tworzeniu
 * (`create-recipe.ts`), bez `is_ai_generated`, którego edycja nie zmienia.
 */
export const updateRecipeSchema = z.object({
  title: recipeTitleSchema,
  content: recipeContentSchema,
  additional_params: recipeAdditionalParamsSchema,
});

export type UpdateRecipeSchema = z.infer<typeof updateRecipeSchema>;
