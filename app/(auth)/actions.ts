"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/auth/app-url";
import { loginSchema, signupSchema, type AuthState } from "@/lib/validation/auth";

const unavailable = "Tjänsten är inte tillgänglig just nu. Försök igen om en stund.";

export async function login(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { message: "Det gick inte att logga in. Kontrollera e-post, lösenord och att kontot är bekräftat." };
  } catch { return { message: unavailable }; }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({ email: formData.get("email"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: new URL("/auth/callback", getAppUrl()).href },
    });
    if (error) return { message: "Det gick inte att skapa kontot. Försök igen senare eller logga in om du redan har ett konto." };
    signedIn = Boolean(data.session);
  } catch { return { message: unavailable }; }
  if (signedIn) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  return { success: true, message: "Kontrollera din e-post för att bekräfta kontot. Har du redan ett konto kan du logga in." };
}

export async function logout(): Promise<AuthState> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { message: "Det gick inte att logga ut. Försök igen." };
  } catch { return { message: unavailable }; }
  revalidatePath("/", "layout");
  redirect("/login");
}
