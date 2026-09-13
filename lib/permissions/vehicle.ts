import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createReadOnlyClient } from "@/lib/supabase/server";

export async function requireVehicleAccess(vehicleId: string) {
  const user = await requireUser();
  if (!z.uuid().safeParse(vehicleId).success) notFound();
  const supabase = await createReadOnlyClient();
  const { data, error } = await supabase.from("vehicle_ownerships").select("vehicle_id")
    .eq("vehicle_id", vehicleId).eq("user_id", user.id).eq("role", "owner")
    .eq("status", "active").is("ended_at", null).maybeSingle();
  if (error) throw new Error("Fordonsbehörighet kunde inte kontrolleras.");
  if (!data) notFound();
  return { supabase, user };
}
