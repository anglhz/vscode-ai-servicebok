import { z } from "zod";

const email = z.string().trim().max(254, "E-postadressen är för lång.").email("Ange en giltig e-postadress.");
const password = z.string().min(1, "Ange ditt lösenord.").max(128, "Lösenordet får ha högst 128 tecken.");

export const loginSchema = z.object({ email, password });
export const signupSchema = z.object({
  email,
  password: password.min(12, "Använd minst 12 tecken."),
  confirmPassword: z.string().max(128, "Lösenordet får ha högst 128 tecken."),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"], message: "Lösenorden stämmer inte överens.",
});

export type AuthState = {
  message?: string;
  success?: boolean;
  errors?: Partial<Record<"email" | "password" | "confirmPassword", string[]>>;
};
