import { type Page, type Locator, expect } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly homepage: Locator;
  readonly searchInput: Locator;
  readonly clearSearchButton: Locator;
  readonly sortSelect: Locator;
  readonly sortOrderButton: Locator;
  readonly aiGenerateButton: Locator;
  readonly addRecipeButton: Locator;
  readonly searchResultsInfo: Locator;
  readonly emptyRecipesState: Locator;
  readonly emptyStateActionButton: Locator;
  readonly recipesGrid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.homepage = page.getByTestId("homepage");
    this.searchInput = page.getByTestId("search-recipes-input");
    this.clearSearchButton = page.getByTestId("clear-search-button");
    this.sortSelect = page.getByTestId("sort-select");
    this.sortOrderButton = page.getByTestId("sort-order-button");
    this.aiGenerateButton = page.getByTestId("ai-generate-button");
    this.addRecipeButton = page.getByTestId("add-recipe-button-main");
    this.searchResultsInfo = page.getByTestId("search-results-info");
    this.emptyRecipesState = page.getByTestId("empty-recipes-state");
    this.emptyStateActionButton = page.getByTestId("empty-state-action-button");
    this.recipesGrid = page.getByTestId("recipes-grid");
  }

  async goto() {
    await this.page.goto("/");
  }

  async expectHomePageVisible() {
    await expect(this.homepage).toBeVisible();
  }

  async clickAddRecipe() {
    await this.addRecipeButton.click();
  }

  async clickAiGenerate() {
    await this.aiGenerateButton.click();
  }

  async searchRecipes(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.clearSearchButton.click();
  }

  async expectSearchResults(count: number, query: string) {
    await expect(this.searchResultsInfo).toBeVisible();
    await expect(this.searchResultsInfo).toContainText(`Znaleziono ${count} wyników dla "${query}"`);
  }

  async expectEmptyState() {
    await expect(this.emptyRecipesState).toBeVisible();
    await expect(this.emptyRecipesState).toContainText("Brak przepisów");
  }

  async expectEmptySearchState(query: string) {
    await expect(this.emptyRecipesState).toBeVisible();
    await expect(this.emptyRecipesState).toContainText("Nie znaleziono przepisów");
  }

  async expectRecipesGridVisible() {
    await expect(this.recipesGrid).toBeVisible();
  }

  async selectSortOption(option: "created_at" | "updated_at" | "title") {
    await this.sortSelect.selectOption(option);
  }

  async toggleSortOrder() {
    await this.sortOrderButton.click();
  }

  async expectSortOrder(order: "desc" | "asc") {
    const ariaLabel = order === "desc" ? "Sortuj malejąco" : "Sortuj rosnąco";
    await expect(this.sortOrderButton).toHaveAttribute("aria-label", ariaLabel);
  }

  async clickEmptyStateAction() {
    await this.emptyStateActionButton.click();
  }

  async expectClearSearchButtonVisible() {
    await expect(this.clearSearchButton).toBeVisible();
  }

  async expectAddRecipeButtonEnabled() {
    await expect(this.addRecipeButton).toBeEnabled();
  }

  async waitForSearchResults() {
    // Czeka na zaladowanie wyników wyszukiwania (debounce)
    await this.page.waitForTimeout(600); // 500ms debounce + buffer
  }

  async getRecipeCount(): Promise<number> {
    const recipeCards = this.page.getByTestId(/^recipe-card-/);
    return await recipeCards.count();
  }

  async expectMinimumRecipes(count: number) {
    const recipeCards = this.page.getByTestId(/^recipe-card-/);
    await expect(recipeCards).toHaveCount(count, { timeout: 10000 });
  }
}
