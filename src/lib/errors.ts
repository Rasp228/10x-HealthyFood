export interface AppErrorDetails {
  code?: string;
  field?: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: AppErrorDetails;

  constructor(message: string, code = "UNKNOWN_ERROR", statusCode = 500, details?: AppErrorDetails) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Zachowanie stack trace w V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// Fabryki błędów autentykacji
export const AuthError = {
  unauthorized: (message = "Nieautoryzowany dostęp") => {
    return new AppError(message, "UNAUTHORIZED", 401);
  },

  invalidCredentials: (message = "Nieprawidłowy email lub hasło") => {
    return new AppError(message, "INVALID_CREDENTIALS", 401);
  },

  emailAlreadyInUse: (message = "Ten adres email jest już zarejestrowany") => {
    return new AppError(message, "EMAIL_ALREADY_IN_USE", 409);
  },

  weakPassword: (message = "Hasło nie spełnia wymagań bezpieczeństwa") => {
    return new AppError(message, "WEAK_PASSWORD", 400);
  },

  emailNotVerified: (message = "Adres email nie został zweryfikowany") => {
    return new AppError(message, "EMAIL_NOT_VERIFIED", 400);
  },

  invalidResetToken: (message = "Nieprawidłowy token resetowania hasła") => {
    return new AppError(message, "INVALID_RESET_TOKEN", 400);
  },

  userNotFound: (message = "Nie znaleziono użytkownika") => {
    return new AppError(message, "USER_NOT_FOUND", 404);
  },
};

export const ValidationError = {
  invalidData: (message = "Nieprawidłowe dane", details?: AppErrorDetails) => {
    return new AppError(message, "INVALID_DATA", 400, details);
  },

  requiredField: (field: string) => {
    return new AppError(`Pole "${field}" jest wymagane`, "REQUIRED_FIELD", 400, { field });
  },

  invalidFormat: (field: string, format: string) => {
    return new AppError(`Pole "${field}" ma nieprawidłowy format: ${format}`, "INVALID_FORMAT", 400, { field });
  },
};

export const ServerError = {
  internal: (message = "Wystąpił błąd serwera") => {
    return new AppError(message, "INTERNAL_SERVER_ERROR", 500);
  },

  database: (message = "Błąd bazy danych") => {
    return new AppError(message, "DATABASE_ERROR", 500);
  },
};
