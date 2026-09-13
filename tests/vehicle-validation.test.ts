import { describe, expect, it } from "vitest";
import { createVehicleSchema, normalizeVin } from "@/lib/validation/vehicle";
import { normalizeRegistrationNumber } from "@/lib/utils/format";

const valid = { vehicle_type: "car", make: " Volvo ", model: "V60", registration_number: "", vin: "", model_year: "", current_mileage: "", fuel_type: "" };
describe("manual vehicle validation", () => {
  it("normalizes whitespace and case without imposing modern identifier formats", () => {
    expect(normalizeRegistrationNumber(" ab\tc 123\n")).toBe("ABC123");
    expect(normalizeVin("ab 123\tcd")).toBe("AB123CD");
    expect(createVehicleSchema.parse({ ...valid, registration_number: "a 12", vin: "short vin" })).toMatchObject({ registration_number: "A12", vin: "SHORTVIN" });
  });
  it("keeps absent values null, trims names and preserves zero mileage", () => {
    expect(createVehicleSchema.parse(valid)).toMatchObject({ make: "Volvo", registration_number: null, vin: null, model_year: null, current_mileage: null, fuel_type: null });
    expect(createVehicleSchema.parse({ ...valid, current_mileage: "0" }).current_mileage).toBe(0);
  });
  it.each([
    ["make", " "], ["model", ""], ["vehicle_type", "invalid"], ["model_year", "1885"],
    ["model_year", "2101"], ["model_year", "2020.5"], ["current_mileage", "-1"],
    ["current_mileage", "1.5"], ["current_mileage", "1e3"], ["current_mileage", "2147483648"],
    ["registration_number", "A".repeat(33)], ["vin", "A".repeat(65)], ["fuel_type", "A".repeat(51)],
  ])("rejects invalid %s: %s", (field, value) => {
    expect(createVehicleSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
  it("accepts year boundaries and strips unexpected identity fields", () => {
    for (const year of ["1886", "2100"]) {
      const value = createVehicleSchema.parse({ ...valid, model_year: year, user_id: "other" });
      expect(value.model_year).toBe(Number(year));
      expect(value).not.toHaveProperty("user_id");
    }
  });
});
