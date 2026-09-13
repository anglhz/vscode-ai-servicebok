"use client";

import { useActionState } from "react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import type { AuthState } from "@/lib/validation/auth";

export function LogoutButton() {
  const [state, action, pending] = useActionState<AuthState>(logout, {});
  return <form action={action} className="space-y-3">
    <Button type="submit" variant="outline" className="min-h-12" disabled={pending}>{pending ? "Loggar ut…" : "Logga ut"}</Button>
    {state.message && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </form>;
}
