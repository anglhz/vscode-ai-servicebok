import { createHash, timingSafeEqual } from "node:crypto";
import { cleanupDocumentRetention } from "@/services/document-cleanup";

export const runtime = "nodejs";
export const maxDuration = 60;

function response(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32 || secret !== secret.trim()) return response({ status: "unavailable" }, 503);
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))) {
    return response({ status: "unauthorized" }, 401);
  }
  // No cookies, body, querystring or user-selected IDs influence this operation.
  try {
    const { claimed, deleted, failed } = await cleanupDocumentRetention();
    const outcome = { status: failed ? "partial" : "completed", claimed, deleted, failed };
    console.info("document_cleanup", outcome);
    return response(outcome);
  } catch {
    console.error("document_cleanup", { status: "failed" });
    return response({ status: "failed" }, 503);
  }
}
