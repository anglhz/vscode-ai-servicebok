import { z } from "zod";

export const transferTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const transferSelectionSchema = z.array(z.uuid()).max(100);
export const transferStatusSchema = z.enum(["pending", "accepted", "cancelled", "expired"]);
export const transferSummarySchema = z.object({ id: z.uuid(), status: transferStatusSchema, expires_at: z.string() });
export const transferPreviewSchema = z.object({
  status: transferStatusSchema, make: z.string().nullable(), model: z.string().nullable(),
  registration_number: z.string().nullable(), expires_at: z.string(), document_count: z.number().int().nonnegative(), is_sender: z.boolean(),
});
export type TransferState = { message?: string; url?: string; expiresAt?: string; cancelled?: boolean; premiumRequired?: boolean };
