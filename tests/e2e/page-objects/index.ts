// Główne Page Objects
export { LoginPage } from "./LoginPage";
export { HomePage } from "./HomePage";
export { RecipeFormPage } from "./RecipeFormPage";
export { DiaryPage } from "./DiaryPage";
export { Application } from "./Application";

// Serwisy
export { CleanupService } from "../services/cleanup.service";

// Typy pomocnicze dla Page Objects
export type { DiaryEntryData } from "./DiaryPage";

export interface RecipeData {
  title: string;
  content: string;
  additionalParams?: string;
}

export interface LoginCredentials {
  userId: string;
  email: string;
  password: string;
}
