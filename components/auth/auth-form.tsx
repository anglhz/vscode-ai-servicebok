"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login, signup } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthState } from "@/lib/validation/auth";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const registering = mode === "signup";
  const [state, action, pending] = useActionState<AuthState, FormData>(registering ? signup : login, {});
  const [values, setValues] = useState({ email: "", password: "", confirmPassword: "" });
  const fields = registering ? ["email", "password", "confirmPassword"] as const : ["email", "password"] as const;
  const labels = { email: "E-post", password: "Lösenord", confirmPassword: "Bekräfta lösenord" };
  return <>
    <h1 className="text-2xl font-semibold">{registering ? "Skapa konto" : "Logga in"}</h1>
    <p className="mt-2 mb-6 text-sm text-muted-foreground">{registering ? "Samla ditt fordons historia på ett ställe." : "Välkommen tillbaka till Servicebok."}</p>
    {state.success ? <p role="status" className="text-sm leading-6">{state.message}</p> :
      <form action={action} className="space-y-4">
        {fields.map((name) => <div key={name} className="space-y-2">
          <label htmlFor={name} className="text-sm font-medium">{labels[name]}</label>
          <Input id={name} name={name} type={name === "email" ? "email" : "password"} required
            autoComplete={name === "email" ? "email" : registering ? "new-password" : "current-password"}
            maxLength={name === "email" ? 254 : 128} minLength={name !== "email" && registering ? 8 : undefined}
            autoCapitalize="none" spellCheck={false} className="min-h-12 text-base"
            value={values[name]} onChange={(event) => setValues({ ...values, [name]: event.target.value })}
            aria-invalid={Boolean(state.errors?.[name])} aria-describedby={state.errors?.[name] ? `${name}-error` : name === "password" && registering ? "password-help" : undefined} />
          {name === "password" && registering && <p id="password-help" className="text-xs text-muted-foreground">Använd 8–128 tecken.</p>}
          {state.errors?.[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{state.errors[name]?.[0]}</p>}
        </div>)}
        {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
        <Button type="submit" disabled={pending} aria-busy={pending} className="min-h-12 w-full">{pending ? "Vänta…" : registering ? "Skapa konto" : "Logga in"}</Button>
      </form>}
    <p className="mt-6 text-sm text-muted-foreground">{registering ? "Har du redan ett konto?" : "Ny här?"} <Link className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4" href={registering ? "/login" : "/signup"}>{registering ? "Logga in" : "Skapa konto"}</Link></p>
  </>;
}
