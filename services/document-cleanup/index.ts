import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_BUCKET } from "@/lib/validation/document";

const batchSize = 50;
const candidatesSchema = z.array(z.object({
  id: z.uuid(), storage_path: z.string().min(1), lease_token: z.uuid(),
})).max(batchSize);

export async function cleanupDocumentRetention() {
  // All requests share a deadline shorter than the route's 60s runtime and the
  // five-minute DB lease. Aborting an uncertain delete leaves it retryable.
  const deadline = AbortSignal.timeout(45_000);
  const supabase = createAdminClient((input, init) => fetch(input, {
    ...init, signal: AbortSignal.any([deadline, AbortSignal.timeout(5_000), ...(init?.signal ? [init.signal] : [])]),
  }));
  const { data, error } = await supabase.rpc("claim_document_cleanup_batch", { p_limit: batchSize });
  if (error) throw new Error("Document cleanup unavailable.");
  const candidates = candidatesSchema.parse(data);
  const counts = { claimed: candidates.length, deleted: 0, failed: 0 };
  // Five workers, at most 50 objects. One failure never stops its neighbours.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, async () => {
    while (next < candidates.length) {
      const candidate = candidates[next++];
      try {
        deadline.throwIfAborted();
        const { error: removeError } = await supabase.storage.from(DOCUMENT_BUCKET).remove([candidate.storage_path]);
        // NoSuchKey is the Storage API's explicit missing-object code. Even then
        // completion independently verifies absence in storage.objects.
        if (removeError && !("code" in removeError && removeError.code === "NoSuchKey")) throw new Error("Storage cleanup failed.");
        const result = await supabase.rpc("complete_document_retention_cleanup", {
          p_document_id: candidate.id, p_lease_token: candidate.lease_token,
        });
        if (result.error || result.data !== true) throw new Error("Cleanup not completed.");
        counts.deleted++;
      } catch {
        counts.failed++;
      }
    }
  }));
  return counts;
}
