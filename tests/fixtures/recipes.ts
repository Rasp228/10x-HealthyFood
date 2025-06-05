/**
 * Test fixtures dla przepisów
 */

export const mockRecipes = [
  {
    id: "recipe-1",
    title: "Sałatka z awokado i pomidorami",
    description: "Świeża i zdrowa sałatka idealna na lunch",
    ingredients: [
      "2 awokado",
      "4 pomidory koktajlowe",
      "1 czerwona cebula",
      "2 łyżki oliwy z oliwek",
      "1 łyżka soku z limonki",
      "Sól i pieprz do smaku",
    ],
    instructions:
      "1. Pokrój awokado i pomidory\n2. Posiekaj cebulę\n3. Wymieszaj z oliwą i sokiem z limonki\n4. Dopraw solą i pieprzem",
    prep_time: 15,
    cook_time: 0,
    servings: 2,
    difficulty: "easy" as const,
    tags: ["vegan", "healthy", "quick", "salad"],
    nutrition: {
      calories: 280,
      protein: 4,
      carbs: 12,
      fat: 26,
      fiber: 10,
    },
    user_id: "user-1",
    created_at: "2024-01-01T10:00:00.000Z",
    updated_at: "2024-01-01T10:00:00.000Z",
  },
  {
    id: "recipe-2",
    title: "Smoothie z bananami i szpinakiem",
    description: "Zielone smoothie pełne witamin na dobry start dnia",
    ingredients: [
      "2 banany",
      "1 garść świeżego szpinaku",
      "300ml mleka migdałowego",
      "1 łyżka miodu",
      "1/2 awokado",
      "Kostki lodu",
    ],
    instructions:
      "1. Włóż wszystkie składniki do blendera\n2. Miksuj przez 60-90 sekund\n3. Dodaj kostki lodu i miksuj ponownie\n4. Podawaj od razu",
    prep_time: 5,
    cook_time: 0,
    servings: 1,
    difficulty: "easy" as const,
    tags: ["vegan", "healthy", "breakfast", "smoothie"],
    nutrition: {
      calories: 320,
      protein: 8,
      carbs: 45,
      fat: 12,
      fiber: 8,
    },
    user_id: "user-1",
    created_at: "2024-01-02T08:00:00.000Z",
    updated_at: "2024-01-02T08:00:00.000Z",
  },
  {
    id: "recipe-3",
    title: "Pasta z cukinią i czosnkiem",
    description: "Prosta i smakowita pasta z warzywami",
    ingredients: [
      "300g makaronu penne",
      "2 cukinie",
      "4 ząbki czosnku",
      "3 łyżki oliwy z oliwek",
      "50g parmezanu",
      "Świeża bazylia",
      "Sól i pieprz",
    ],
    instructions:
      "1. Ugotuj makaron al dente\n2. Pokrój cukinię w plastry\n3. Podsmaż czosnek na oliwie\n4. Dodaj cukinię i smaż 5 min\n5. Wymieszaj z makaronem\n6. Posyp parmezanem i bazylią",
    prep_time: 10,
    cook_time: 20,
    servings: 4,
    difficulty: "medium" as const,
    tags: ["vegetarian", "pasta", "dinner"],
    nutrition: {
      calories: 420,
      protein: 15,
      carbs: 65,
      fat: 12,
      fiber: 4,
    },
    user_id: "user-2",
    created_at: "2024-01-03T18:30:00.000Z",
    updated_at: "2024-01-03T18:30:00.000Z",
  },
];

export const mockRecipePreferences = [
  {
    id: "pref-1",
    user_id: "user-1",
    preference_type: "liked_ingredient",
    value: "awokado",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pref-2",
    user_id: "user-1",
    preference_type: "disliked_ingredient",
    value: "grzyby",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pref-3",
    user_id: "user-1",
    preference_type: "dietary_restriction",
    value: "vegan",
    created_at: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "pref-4",
    user_id: "user-1",
    preference_type: "cuisine_type",
    value: "mediterranean",
    created_at: "2024-01-01T00:00:00.000Z",
  },
];

export const mockUsers = [
  {
    id: "user-1",
    email: "user1@example.com",
    created_at: "2024-01-01T00:00:00.000Z",
    preferences_count: 4,
  },
  {
    id: "user-2",
    email: "user2@example.com",
    created_at: "2024-01-02T00:00:00.000Z",
    preferences_count: 0,
  },
];

// Helper functions
export const getRecipeById = (id: string) => mockRecipes.find((recipe) => recipe.id === id);

export const getRecipesByUser = (userId: string) => mockRecipes.filter((recipe) => recipe.user_id === userId);

export const getRecipesByTag = (tag: string) => mockRecipes.filter((recipe) => recipe.tags.includes(tag));

export const createMockRecipe = (overrides: Partial<(typeof mockRecipes)[0]> = {}) => ({
  id: "new-recipe-id",
  title: "Test Recipe",
  description: "Test description",
  ingredients: ["ingredient 1", "ingredient 2"],
  instructions: "Test instructions",
  prep_time: 10,
  cook_time: 5,
  servings: 2,
  difficulty: "easy" as const,
  tags: ["test"],
  nutrition: {
    calories: 200,
    protein: 5,
    carbs: 30,
    fat: 8,
    fiber: 3,
  },
  user_id: "test-user",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});
