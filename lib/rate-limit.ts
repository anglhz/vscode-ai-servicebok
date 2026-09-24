import "server-only";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitScope = "vehicle_lookup" | "pdf_export" | "billing_checkout" | "billing_portal" | "transfer_preview" | "transfer_accept";
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfter: number) { super("För många försök. Vänta en stund och försök igen."); }
}
const resultSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true), retry_after: z.literal(0) }),
  z.object({ allowed: z.literal(false), retry_after: z.number().int().min(1).max(600) }),
]);

/** One independent, committed RPC before provider work: failures never refund attempts. */
export async function enforceRateLimit(scope: RateLimitScope) {
  const user = await requireUser();
  let result: z.infer<typeof resultSchema>;
  try {
    const { data, error } = await createAdminClient().rpc("consume_rate_limit", { p_scope: scope, p_user_id: user.id });
    if (error) throw new Error("Rate limit unavailable");
    result = resultSchema.parse(data);
  } catch { throw new Error("Försöket kunde inte genomföras. Försök igen om en stund."); }
  if (!result.allowed) throw new RateLimitExceededError(result.retry_after);
}
