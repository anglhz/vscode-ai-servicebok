import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createReadOnlyClient } from "@/lib/supabase/server";

// Runtime validation of the selected UI fields, not hand-written generated database types.
const profileSchema = z.object({ display_name: z.string().nullable() });

export async function getOwnProfile() {
  const user = await requireUser();
  const supabase = await createReadOnlyClient();
  const { data, error } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  if (error) return { profile: null, unavailable: true };
  const parsed = profileSchema.safeParse(data);
  return { profile: parsed.success ? parsed.data : null, unavailable: !parsed.success };
}
