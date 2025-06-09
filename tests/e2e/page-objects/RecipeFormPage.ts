import { type Page, type Locator, expect } from "@playwright/test";

export class RecipeFormPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly modalTitle: Locator;
  readonly modalCloseButton: Locator;
  readonly form: Locator;
  readonly formError: Locator;
  readonly titleInput: Locator;
  readonly titleError: Locator;
  readonly contentInput: Locator;
  readonly contentError: Locator;
  readonly additionalParamsInput: Locator;
  readonly additionalParamsError: Locator;
  readonly cancelButton: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.getByTestId("recipe-form-modal");
    this.modalTitle = page.getByTestId("modal-title");
    this.modalCloseButton = page.getByTestId("modal-close-button");
    this.form = page.getByTestId("recipe-form");
    this.formError = page.getByTestId("recipe-form-error");
    this.titleInput = page.getByTestId("recipe-title-input");
    this.titleError = page.getByTestId("recipe-title-error");
    this.contentInput = page.getByTestId("recipe-content-input");
    this.contentError = page.getByTestId("recipe-content-error");
    this.additionalParamsInput = page.getByTestId("recipe-additional-params-input");
    this.additionalParamsError = page.getByTestId("recipe-additional-params-error");
    this.cancelButton = page.getByTestId("recipe-form-cancel-button");
    this.submitButton = page.getByTestId("recipe-form-submit-button");
  }

  async expectModalVisible() {
    await expect(this.modal).toBeVisible();
    await expect(this.form).toBeVisible();
  }

  async expectModalTitle(title: string) {
    await expect(this.modalTitle).toHaveText(title);
  }

  async expectAddRecipeModal() {
    await this.expectModalVisible();
    await this.expectModalTitle("Dodaj nowy przepis");
  }

  async expectEditRecipeModal() {
    await this.expectModalVisible();
    await this.expectModalTitle("Edytuj przepis");
  }

  async fillTitle(title: string) {
    await this.titleInput.fill(title);
  }

  async fillContent(content: string) {
    await this.contentInput.fill(content);
  }

  async fillAdditionalParams(params: string) {
    await this.additionalParamsInput.fill(params);
  }

  async fillRecipeForm(data: { title: string; content: string; additionalParams?: string }) {
    await this.fillTitle(data.title);
    await this.fillContent(data.content);
    if (data.additionalParams) {
      await this.fillAdditionalParams(data.additionalParams);
    }
  }

  async submitForm() {
    await this.submitButton.click();
  }

  async cancelForm() {
    await this.cancelButton.click();
  }

  async closeModal() {
    await this.modalCloseButton.click();
  }

  async expectFormError(errorText: string) {
    await expect(this.formError).toBeVisible();
    await expect(this.formError).toContainText(errorText);
  }

  async expectTitleError(errorText: string) {
    await expect(this.titleError).toBeVisible();
    await expect(this.titleError).toHaveText(errorText);
  }

  async expectContentError(errorText: string) {
    await expect(this.contentError).toBeVisible();
    await expect(this.contentError).toHaveText(errorText);
  }

  async expectAdditionalParamsError(errorText: string) {
    await expect(this.additionalParamsError).toBeVisible();
    await expect(this.additionalParamsError).toHaveText(errorText);
  }

  async expectLoadingState() {
    await expect(this.submitButton).toBeDisabled();
    await expect(this.submitButton).toContainText(/(?:Dodawanie|Zapisywanie)\.\.\./);
  }

  async expectModalClosed() {
    await expect(this.modal).not.toBeVisible();
  }

  async expectSubmitButtonText(text: string) {
    await expect(this.submitButton).toHaveText(text);
  }

  async expectFormValues(data: { title?: string; content?: string; additionalParams?: string }) {
    if (data.title !== undefined) {
      await expect(this.titleInput).toHaveValue(data.title);
    }
    if (data.content !== undefined) {
      await expect(this.contentInput).toHaveValue(data.content);
    }
    if (data.additionalParams !== undefined) {
      await expect(this.additionalParamsInput).toHaveValue(data.additionalParams);
    }
  }

  async clearForm() {
    await this.titleInput.clear();
    await this.contentInput.clear();
    await this.additionalParamsInput.clear();
  }

  async expectValidationErrors() {
    // Spróbuj wysłać pusty formularz
    await this.submitForm();

    // Sprawdź błędy walidacji
    await this.expectTitleError("Tytuł jest wymagany");
    await this.expectContentError("Treść przepisu jest wymagana");
  }

  async getTitleCharacterCount(): Promise<string> {
    const titleValue = await this.titleInput.inputValue();
    return `${titleValue.length}/100`;
  }

  async getContentCharacterCount(): Promise<string> {
    const contentValue = await this.contentInput.inputValue();
    return `${contentValue.length}/5000`;
  }

  // Metoda do testowania maksymalnej długości pól
  async expectMaxLengthValidation() {
    // Test maksymalnej długości tytułu (100 znaków)
    const longTitle = "a".repeat(101);
    await this.fillTitle(longTitle);
    await expect(this.titleInput).toHaveValue("a".repeat(100)); // Powinna być obcięta

    // Test maksymalnej długości treści (5000 znaków)
    const longContent = "b".repeat(5001);
    await this.fillContent(longContent);
    await expect(this.contentInput).toHaveValue("b".repeat(5000)); // Powinna być obcięta
  }
}
