import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizedVehicleSchema, type NormalizedVehicle } from "./types";

const schema = z.object({ user: z.string(), expires: z.number(), fetchedAt: z.iso.datetime(), vehicle: normalizedVehicleSchema });
function signature(payload: string) {
  const key = process.env.VEHICLE_LOOKUP_SIGNING_SECRET;
  if (!key || Buffer.byteLength(key) < 32) throw new Error("Lookup signing unavailable");
  return createHmac("sha256", key).update(`vehicle-lookup-v1:${payload}`).digest("base64url");
}
export function signLookup(user: string, vehicle: NormalizedVehicle, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ user, expires: now + 15 * 60_000, fetchedAt: new Date(now).toISOString(), vehicle })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyLookup(receipt: string, user: string, now = Date.now()) {
  if (receipt.length > 16000) throw new Error("Invalid lookup");
  const [payload, supplied, extra] = receipt.split(".");
  if (!payload || !supplied || extra) throw new Error("Invalid lookup");
  const actual = Buffer.from(signature(payload)); const received = Buffer.from(supplied);
  if (actual.length !== received.length || !timingSafeEqual(actual, received)) throw new Error("Invalid lookup");
  const value = schema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
  if (value.user !== user || value.expires <= now || value.expires > now + 15 * 60_000) throw new Error("Expired lookup");
  return value;
}
