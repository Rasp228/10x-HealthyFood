import { z } from "zod";

// Schemat dla etapu żądania resetowania (przez email)
export const requestResetSchema = z.object({
  email: z.string().email("Wprowadź poprawny adres email"),
});

// Schemat dla etapu ustawiania nowego hasła
export const confirmResetSchema = z
  .object({
    token: z.string().min(1, "Token jest wymagany"),
    password: z
      .string()
      .min(8, "Hasło musi mieć co najmniej 8 znaków")
      .regex(/\d/, "Hasło musi zawierać co najmniej jedną cyfrę")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Hasło musi zawierać co najmniej jeden znak specjalny"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Hasła muszą być identyczne",
    path: ["confirmPassword"],
  });

export type RequestResetSchema = z.infer<typeof requestResetSchema>;
export type ConfirmResetSchema = z.infer<typeof confirmResetSchema>;
