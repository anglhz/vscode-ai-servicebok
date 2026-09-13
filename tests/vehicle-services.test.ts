import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createReadOnlyClient: async () => mocks, createClient: async () => mocks }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { createVehicle, getVehicleForCurrentUser, getVehiclesForCurrentUser } from "@/services/vehicles";
import { saveVehicle } from "../app/(app)/vehicles/new/actions";

const id = "11111111-1111-4111-8111-111111111111";
const input = { vehicle_type: "car", make: "Volvo", model: "V60", registration_number: "abc 123", vin: "", model_year: "2021", current_mileage: "0", fuel_type: "" };
const vehicle = { id, ...input, registration_number: "ABC123", vin: null, model_year: 2021, current_mileage: 0, fuel_type: null };
function query(data: unknown, error: unknown = null) {
  const result = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(), order: vi.fn() };
  result.select.mockReturnValue(result); result.eq.mockReturnValue(result); result.is.mockReturnValue(result);
  result.maybeSingle.mockResolvedValue({ data, error }); result.order.mockResolvedValue({ data, error });
  return result;
}
function form(values = input) { const result = new FormData(); for (const [key, value] of Object.entries(values)) result.set(key, value); return result; }
beforeEach(() => { vi.resetAllMocks(); mocks.requireUser.mockResolvedValue({ id: "verified-user" }); });

describe("vehicle permissions and services", () => {
  it("requires a verified session before any database access", async () => {
    mocks.requireUser.mockRejectedValue(new Error("redirect:/login"));
    for (const operation of [() => getVehiclesForCurrentUser(), () => getVehicleForCurrentUser(id), () => createVehicle(input)]) {
      await expect(operation()).rejects.toThrow("redirect:/login");
    }
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks active owner using verified identity and treats missing access as not found", async () => {
    const ownership = query(null); mocks.from.mockReturnValue(ownership);
    await expect(requireVehicleAccess(id)).rejects.toThrow("not-found");
    expect(ownership.eq).toHaveBeenCalledWith("user_id", "verified-user");
    expect(ownership.eq).toHaveBeenCalledWith("role", "owner");
    expect(ownership.eq).toHaveBeenCalledWith("status", "active");
    expect(ownership.is).toHaveBeenCalledWith("ended_at", null);
  });
  it("does not query malformed ids", async () => {
    await expect(requireVehicleAccess("bad-id")).rejects.toThrow("not-found");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("fails closed on ownership errors without exposing database details", async () => {
    mocks.from.mockReturnValue(query(null, { message: "private database detail" }));
    await expect(requireVehicleAccess(id)).rejects.toThrow("Fordonsbehörighet kunde inte kontrolleras.");
  });
  it("loads a vehicle after permission verification and rechecks through RLS", async () => {
    mocks.from.mockReturnValueOnce(query({ vehicle_id: id })).mockReturnValueOnce(query(vehicle));
    expect(await getVehicleForCurrentUser(id)).toEqual(vehicle);
    expect(mocks.from.mock.calls.map(call => call[0])).toEqual(["vehicle_ownerships", "vehicles"]);
    mocks.from.mockReturnValueOnce(query({ vehicle_id: id })).mockReturnValueOnce(query(null));
    await expect(getVehicleForCurrentUser(id)).rejects.toThrow("not-found");
  });
  it("distinguishes list failure from an empty list", async () => {
    mocks.from.mockReturnValueOnce(query([])); expect(await getVehiclesForCurrentUser()).toEqual([]);
    mocks.from.mockReturnValueOnce(query(null, { message: "internal" }));
    await expect(getVehiclesForCurrentUser()).rejects.toThrow("Fordonen kunde inte hämtas.");
  });
  it("validates service calls and sends only normalized fields to the atomic RPC", async () => {
    await expect(createVehicle({ ...input, make: "" })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    expect(await createVehicle({ ...input, user_id: "attacker", vehicle_id: "other" })).toBe(id);
    expect(mocks.rpc).toHaveBeenCalledWith("create_vehicle", {
      p_vehicle_type: "car", p_make: "Volvo", p_model: "V60", p_registration_number: "ABC123",
      p_vin: null, p_model_year: 2021, p_current_mileage: 0, p_fuel_type: null,
    });
  });
});

describe("vehicle server action", () => {
  it("returns field errors without mutating", async () => {
    expect((await saveVehicle({}, form({ ...input, current_mileage: "-1" }))).errors?.current_mileage).toBeDefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns a retryable message without leaking raw database errors", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "private database error" } });
    expect(await saveVehicle({}, form())).toEqual({ message: "Fordonet kunde inte sparas. Försök igen." });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("invalidates list/dashboard and redirects to the new vehicle only after success", async () => {
    mocks.rpc.mockResolvedValue({ data: id, error: null });
    await expect(saveVehicle({}, form())).rejects.toThrow(`redirect:/vehicles/${id}`);
    expect(mocks.revalidate.mock.calls).toEqual([["/vehicles"], ["/dashboard"]]);
  });
});
