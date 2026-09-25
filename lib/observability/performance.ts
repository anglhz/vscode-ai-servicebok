import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { headers } from "next/headers";

export const performanceRequestHeader = "x-servicebok-request-id";

export type PerformanceStep =
  | "proxy.get_claims"
  | "auth.get_user"
  | "dashboard.vehicles_query"
  | "dashboard.reminders_query"
  | "vehicles.main_query"
  | "reminders.main_query"
  | "account.profile_query"
  | "account.billing_query";

type PerformanceContext = { requestId: string; vercelRegion: string };

const safeRequestId = (value: string | null) =>
  value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;

const runtimeRegion = () => {
  const value = process.env.VERCEL_REGION;
  return value && /^[a-z0-9-]{1,32}$/i.test(value) ? value : "unknown";
};

export function createPerformanceContext(requestId: string = randomUUID()): PerformanceContext {
  return { requestId, vercelRegion: runtimeRegion() };
}

const requestPerformanceContext = cache(async (): Promise<PerformanceContext> => {
  try {
    const requestHeaders = await headers();
    return createPerformanceContext(safeRequestId(requestHeaders.get(performanceRequestHeader)) ?? undefined);
  } catch {
    // Unit tests and non-request execution do not have a Next.js request context.
    return createPerformanceContext();
  }
});

export async function measurePerformance<T>(step: PerformanceStep, operation: () => Promise<T>, context?: PerformanceContext): Promise<T> {
  const resolvedContext = context ?? await requestPerformanceContext();
  const started = performance.now();
  let outcome: "ok" | "error" = "ok";
  try {
    return await operation();
  } catch (error) {
    outcome = "error";
    throw error;
  } finally {
    console.info(JSON.stringify({
      category: "navigation_performance",
      step,
      duration_ms: Math.round((performance.now() - started) * 10) / 10,
      outcome,
      request_id: resolvedContext.requestId,
      vercel_region: resolvedContext.vercelRegion,
    }));
  }
}
