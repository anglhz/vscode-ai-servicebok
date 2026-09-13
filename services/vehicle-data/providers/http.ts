import "server-only";
import type { VehicleProvider } from "../provider";
import { lookupRegistrationSchema, VehicleLookupError } from "../types";
import { normalizeHttpVehicle } from "../normalizers/http";

export class HttpVehicleProvider implements VehicleProvider {
  private readonly base: URL;
  constructor(baseUrl: string, private readonly key: string, private readonly request: typeof fetch = fetch) {
    this.base = new URL(baseUrl);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(this.base.hostname);
    if ((this.base.protocol !== "https:" && !(this.base.protocol === "http:" && local && process.env.NODE_ENV !== "production")) ||
      this.base.username || this.base.password || this.base.search || this.base.hash) throw new Error("Invalid provider configuration");
    if (!this.base.pathname.endsWith("/")) this.base.pathname += "/";
  }
  async lookupByRegistrationNumber(input: string) {
    const registration = lookupRegistrationSchema.parse(input);
    const url = new URL(`vehicles/${encodeURIComponent(registration)}`, this.base);
    const signal = AbortSignal.timeout(5000);
    try {
      const response = await this.request(url, { method: "GET", cache: "no-store", redirect: "error",
        headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" }, signal });
      if (response.status === 404) throw new VehicleLookupError("not_found");
      if (response.status === 429) throw new VehicleLookupError("rate_limit");
      if (!response.ok) throw new VehicleLookupError("provider_error");
      if (!response.headers.get("content-type")?.includes("application/json") || !response.body) throw new VehicleLookupError("invalid_response");
      // Bound streamed bodies as well as Content-Length; timeout covers body reading.
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) { await reader.cancel(); throw new VehicleLookupError("invalid_response"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      try {
        const result = normalizeHttpVehicle(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (result.registration_number !== registration) throw new Error("Mismatched registration");
        return result;
      } catch { throw new VehicleLookupError("invalid_response"); }
    } catch (error) {
      if (error instanceof VehicleLookupError) throw error;
      if (signal.aborted || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) throw new VehicleLookupError("timeout");
      throw new VehicleLookupError("network");
    }
  }
}
