"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeReminderStatus } from "@/app/(app)/reminders/actions";
import { Button } from "@/components/ui/button";

export function ReminderActions({ vehicleId, reminderId, linked }: { vehicleId: string; reminderId: string; linked: boolean }) {
  const [pending, setPending] = useState(false), [error, setError] = useState(""); const router = useRouter();
  async function change(status: "completed" | "dismissed") {
    setPending(true); setError("");
    try { const result = await changeReminderStatus(vehicleId, reminderId, status); if (result.message) setError(result.message); else router.refresh(); }
    catch { setError("Påminnelsen kunde inte uppdateras. Försök igen."); }
    finally { setPending(false); }
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    {!linked && <Button className="min-h-12" disabled={pending} aria-busy={pending} onClick={() => change("completed")}>Markera klar</Button>}
    <Button variant="outline" className="min-h-12" disabled={pending} aria-busy={pending} onClick={() => change("dismissed")}>{pending ? "Sparar…" : "Avfärda"}</Button>
  </div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
