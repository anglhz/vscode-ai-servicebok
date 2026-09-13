import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { HttpVehicleProvider } from "@/services/vehicle-data/providers/http";
import { getVehicleProvider } from "@/services/vehicle-data/provider";
import { normalizeHttpVehicle } from "@/services/vehicle-data/normalizers/http";
import { lookupRegistrationSchema } from "@/services/vehicle-data/types";
import { signLookup, verifyLookup } from "@/services/vehicle-data/receipt";

const external = { vehicle: { registrationNumber: "abc 123", vin: " vin 123 ", make: " Volvo ", model: "V60", modelYear: 2021, vehicleYear: 2020, fuelType: "Bensin", powerKw: 145, vehicleType: "car", firstRegistrationDate: "2020-12-01", color: "Blå", id: "provider-123", owner: { name: "not retained" } } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("vehicle provider boundary", () => {
  it("normalizes registration and external fields without retaining raw/owner data", () => {
    expect(lookupRegistrationSchema.parse("abc 123")).toBe("ABC123");
    expect(normalizeHttpVehicle(external)).toEqual({ registration_number: "ABC123", vin: "VIN123", make: "Volvo", model: "V60", model_year: 2021, vehicle_year: 2020, fuel_type: "Bensin", power_kw: 145, vehicle_type: "car", first_registration_date: "2020-12-01", color: "Blå", external_provider: "http-json", external_provider_id: "provider-123" });
  });
  it("uses only normalized input in the server request and puts the key in a header", async () => {
    const request = vi.fn().mockResolvedValue(json(external));
    await new HttpVehicleProvider("https://provider.example/api", "server-secret", request).lookupByRegistrationNumber("abc 123");
    const [url, options] = request.mock.calls[0];
    expect(url.toString()).toBe("https://provider.example/api/vehicles/ABC123");
    expect(options).toMatchObject({ cache: "no-store", redirect: "error", headers: { Authorization: "Bearer server-secret" } });
    expect(url.toString()).not.toContain("server-secret");
  });
  it.each(["", "../ABC123", "https://evil.example", "<script>"])("rejects bad registration %s before fetch", async input => {
    const request = vi.fn();
    await expect(new HttpVehicleProvider("https://provider.example", "secret", request).lookupByRegistrationNumber(input)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{}, { vehicle: { ...external.vehicle, modelYear: "2021" } }, { vehicle: { ...external.vehicle, powerKw: -1 } }, { vehicle: { ...external.vehicle, firstRegistrationDate: "2021-02-30" } }, { vehicle: { ...external.vehicle, model: "\u202etest" } }])("rejects invalid provider data", value => {
    expect(() => normalizeHttpVehicle(value)).toThrow();
  });
  it.each([[404, "not_found"], [429, "rate_limit"], [401, "provider_error"], [500, "provider_error"]])("handles HTTP %s safely", async (status, code) => {
    const request = vi.fn().mockResolvedValue(json({ secret: "raw private error" }, Number(status)));
    await expect(new HttpVehicleProvider("https://provider.example", "secret", request).lookupByRegistrationNumber("ABC123")).rejects.toMatchObject({ code, message: code });
  });
  it("rejects mismatched identifiers, invalid JSON, HTML and oversized streamed data", async () => {
    for (const response of [json({ vehicle: { ...external.vehicle, registrationNumber: "XYZ999" } }), new Response("{", { headers: { "content-type": "application/json" } }), new Response("html"), json({ data: "x".repeat(70000) })]) {
      await expect(new HttpVehicleProvider("https://provider.example", "secret", vi.fn().mockResolvedValue(response)).lookupByRegistrationNumber("ABC123")).rejects.toMatchObject({ code: "invalid_response" });
    }
  });
  it("maps network errors without exposing their text", async () => {
    await expect(new HttpVehicleProvider("https://provider.example", "secret", vi.fn().mockRejectedValue(new Error("secret network info"))).lookupByRegistrationNumber("ABC123")).rejects.toMatchObject({ code: "network", message: "network" });
  });
  it("sets a five second timeout and handles abort", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    try {
      await expect(new HttpVehicleProvider("https://provider.example", "secret", vi.fn().mockRejectedValue(new DOMException("abort", "AbortError"))).lookupByRegistrationNumber("ABC123")).rejects.toMatchObject({ code: "timeout" });
      expect(timeout).toHaveBeenCalledWith(5000);
    } finally { timeout.mockRestore(); }
  });
  it("disables lookup when configuration is absent or unsafe", () => {
    vi.stubEnv("VEHICLE_PROVIDER", ""); expect(getVehicleProvider()).toBeNull();
    vi.stubEnv("VEHICLE_PROVIDER", "http-json"); vi.stubEnv("VEHICLE_API_KEY", "secret"); vi.stubEnv("VEHICLE_API_BASE_URL", "http://provider.example");
    expect(getVehicleProvider()).toBeNull();
    for (const url of ["https://user:password@provider.example", "https://provider.example/?token=secret", "https://provider.example/#fragment"]) expect(() => new HttpVehicleProvider(url, "secret")).toThrow();
  });
});
describe("lookup receipts", () => {
  it("binds normalized data, fetch time, expiry and user with an unexposed server key", () => {
    vi.stubEnv("VEHICLE_LOOKUP_SIGNING_SECRET", "test-only-signing-secret-32-bytes-long");
    const value = normalizeHttpVehicle(external), now = Date.now();
    const receipt = signLookup("user-a", value, now);
    expect(verifyLookup(receipt, "user-a", now)).toMatchObject({ vehicle: value, fetchedAt: new Date(now).toISOString() });
    expect(receipt).not.toContain(process.env.VEHICLE_LOOKUP_SIGNING_SECRET);
    expect(() => verifyLookup(receipt, "user-b", now)).toThrow();
    expect(() => verifyLookup(receipt, "user-a", now + 15 * 60000)).toThrow();
    expect(() => verifyLookup(receipt + "x", "user-a", now)).toThrow();
    const [payload, signature] = receipt.split(".");
    const forged = JSON.parse(Buffer.from(payload, "base64url").toString()); forged.vehicle.vin = "FORGED";
    expect(() => verifyLookup(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`, "user-a", now)).toThrow();
  });
});
