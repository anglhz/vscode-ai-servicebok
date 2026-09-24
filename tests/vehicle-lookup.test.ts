import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), provider: vi.fn(), lookup: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/services/vehicle-data/provider", () => ({ getVehicleProvider: mocks.provider }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mocks }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: (path: string) => { throw new Error(path); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { lookupVehicle } from "@/services/vehicle-data";
import { VehicleLookupError } from "@/services/vehicle-data/types";
import { createVehicle } from "@/services/vehicles";
import { saveVehicle } from "../app/(app)/vehicles/new/actions";

const vehicle = { registration_number: "ABC123", vin: "VIN123", make: "Volvo", model: "V60", model_year: 2021, vehicle_year: 2020, fuel_type: "Bensin", power_kw: 145, vehicle_type: "car", first_registration_date: null, color: null, external_provider: "http-json", external_provider_id: "p123" };
const input = { vehicle_type: "car", make: "Edited", model: "Edited model", registration_number: "ABC123", vin: "VIN123", model_year: "2022", current_mileage: "8000", fuel_type: "Bensin" };
let counter = 0;
beforeEach(() => { vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: `user-${++counter}` }); mocks.provider.mockReturnValue({ lookupByRegistrationNumber: mocks.lookup }); mocks.lookup.mockResolvedValue(vehicle); vi.stubEnv("VEHICLE_LOOKUP_SIGNING_SECRET", "test-only-signing-secret-32-bytes-long"); });
afterEach(() => vi.unstubAllEnvs());
describe("lookup and confirmation services", () => {
  it("requires verified auth before provider calls", async () => {
    mocks.user.mockRejectedValue(new Error("/login")); await expect(lookupVehicle("ABC123")).rejects.toThrow("/login"); expect(mocks.provider).not.toHaveBeenCalled();
  });
  it("normalizes lookup, returns a preview and never creates a vehicle", async () => {
    const result = await lookupVehicle("abc 123"); expect(result.vehicle).toEqual(vehicle);
    expect(mocks.lookup).toHaveBeenCalledWith("ABC123"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["not_found", "timeout", "rate_limit", "invalid_response", "provider_error", "network"] as const)("offers manual fallback for %s", async code => {
    mocks.lookup.mockRejectedValue(new VehicleLookupError(code)); const result = await lookupVehicle("ABC123");
    expect(result.message).toContain("manuellt"); expect(result.vehicle).toBeUndefined(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("provides fallback without keys and without a valid internal result", async () => {
    mocks.provider.mockReturnValueOnce(null); expect((await lookupVehicle("ABC123")).message).toContain("manuellt");
    mocks.lookup.mockResolvedValue({ vehicle_type: "car" }); expect((await lookupVehicle("ABC123")).message).toContain("manuellt");
  });
  it("uses the same atomic create RPC, permits corrections and sends signed provenance", async () => {
    const preview = await lookupVehicle("ABC123"); mocks.rpc.mockResolvedValue({ data: "11111111-1111-4111-8111-111111111111" });
    await createVehicle({ ...input, external_provider: "forged" }, preview.receipt);
    expect(mocks.rpc).toHaveBeenCalledWith("create_vehicle", expect.objectContaining({ p_make: "Edited", p_model_year: 2022, p_lookup_receipt: preview.receipt, p_current_mileage: 8000 }));
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_external_provider");
    await expect(createVehicle({ ...input, vin: "FORGED" }, preview.receipt)).rejects.toThrow();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("requires explicit confirmation and does not reveal owner information for duplicates", async () => {
    const preview = await lookupVehicle("ABC123"); const form = new FormData();
    for (const [key, value] of Object.entries(input)) form.set(key, value); form.set("lookup_receipt", preview.receipt!);
    expect((await saveVehicle({}, form)).message).toContain("Bekräfta"); expect(mocks.rpc).not.toHaveBeenCalled();
    form.set("confirmed", "yes"); mocks.rpc.mockResolvedValue({ error: { code: "23505", message: "private owner info" } });
    expect((await saveVehicle({}, form)).message).toBe("Fordonet finns redan registrerat i Servicebok. Ingen åtkomst har ändrats.");
  });
});

const limiter = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/rate-limit")>(), enforceRateLimit: limiter }));
import { RateLimitExceededError } from "@/lib/rate-limit";

it("stops lookup after distributed deny without constructing/calling a provider", async () => {
  limiter.mockRejectedValue(new RateLimitExceededError(60));
  expect((await lookupVehicle("ABC123")).message).toContain("manuellt");
  expect(limiter).toHaveBeenCalledWith("vehicle_lookup");
  expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.lookup).not.toHaveBeenCalled();
});
it("fails lookup closed on limiter DB failure without leaking details", async () => {
  limiter.mockRejectedValue(new Error("private DB key"));
  const result = await lookupVehicle("ABC123");
  expect(result.message).toContain("manuellt"); expect(result.message).not.toContain("private");
  expect(mocks.lookup).not.toHaveBeenCalled();
});
