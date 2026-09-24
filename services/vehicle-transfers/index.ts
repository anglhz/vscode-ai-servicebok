import "server-only";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlanLimit } from "@/lib/permissions/plan-limit";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/auth/app-url";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createClient } from "@/lib/supabase/server";
import { transferPreviewSchema, transferSelectionSchema, transferSummarySchema, transferTokenSchema } from "@/lib/validation/transfer";

function tokenHash(token: string) { return createHash("sha256").update(transferTokenSchema.parse(token)).digest("hex"); }
export async function getTransferDocumentChoices(vehicleId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const schema = z.object({ id: z.uuid(), file_name: z.string() });
  const choices: z.infer<typeof schema>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("documents").select("id,file_name").eq("vehicle_id", vehicleId)
      .eq("upload_status", "ready").is("deleted_at", null).order("id").range(offset, offset + 499);
    if (error) throw new Error("Dokumenten kunde inte hämtas.");
    const page = z.array(schema).parse(data);
    choices.push(...page);
    if (page.length < 500) return choices;
  }
}
export async function getVehicleTransfer(vehicleId: string) {
  const { supabase } = await requireVehicleAccess(vehicleId);
  const { data, error } = await supabase.from("vehicle_transfers").select("id,status,expires_at")
    .eq("vehicle_id", vehicleId).eq("status", "pending").maybeSingle();
  if (error) throw new Error("Överföringen kunde inte hämtas.");
  if (!data) return null;
  const transfer = transferSummarySchema.parse(data);
  return { ...transfer, status: Date.parse(transfer.expires_at) <= Date.now() ? "expired" as const : transfer.status };
}
export async function createVehicleTransfer(vehicleId: string, documentIds: unknown) {
  await requireVehicleAccess(vehicleId);
  const ids = transferSelectionSchema.parse(documentIds);
  const base = getAppUrl(); // Validate before creating a capability that cannot be recovered.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_vehicle_transfer", { p_vehicle_id: vehicleId, p_document_ids: ids });
  if (error) throw new Error("Överföringen kunde inte skapas. Kontrollera dokumentvalet och om en överföring redan väntar.");
  const result = z.array(z.object({ id: z.uuid(), token: transferTokenSchema, expires_at: z.string() })).length(1).parse(data)[0];
  return { url: new URL(`/transfer/${result.token}`, base).href, expiresAt: result.expires_at };
}
export async function previewVehicleTransfer(token: string) {
  const user = await requireUser();
  const digest = tokenHash(token);
  await enforceRateLimit("transfer_preview");
  const { data, error } = await createAdminClient().rpc("server_preview_vehicle_transfer", { p_user_id: user.id, p_token_hash: digest });
  if (error) throw new Error("Överföringen kunde inte hämtas.");
  return z.array(transferPreviewSchema).max(1).parse(data)[0] ?? null;
}
export async function acceptVehicleTransfer(token: string) {
  const user = await requireUser();
  const digest = tokenHash(token);
  await enforceRateLimit("transfer_accept");
  const { data, error } = await createAdminClient().rpc("server_accept_vehicle_transfer", { p_user_id: user.id, p_token_hash: digest });
  checkPlanLimit(error);
  if (error) throw new Error("Överföringen kunde inte accepteras. Länken kan ha gått ut, avbrutits eller redan använts.");
  return z.uuid().parse(data);
}
export async function cancelVehicleTransfer(vehicleId: string, transferId: string) {
  await requireVehicleAccess(vehicleId);
  const id = z.uuid().parse(transferId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_vehicle_transfer", { p_vehicle_id: vehicleId, p_transfer_id: id });
  if (error) throw new Error("Överföringen kunde inte avbrytas. Uppdatera sidan och försök igen.");
}
