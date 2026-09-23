import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createVehicleExportModel } from "@/services/exports/model";
import { generateVehiclePdf } from "@/services/exports/pdf";

it.each([1, 100, 1000])("renders complete PDF for %i Unicode history entries", async (count) => {
  const model = createVehicleExportModel({
    generated_at: "2026-09-22T12:00:00Z",
    vehicle: { registration_number: "QA1234", make: "Müller Łódź", model: "Сервис محمد",
      model_year: 2020, vehicle_type: "car", vin: null, current_mileage: 20000 },
    events: Array.from({ length: count }, (_, i) => ({ event_date: "2026-01-01", category: "service",
      title: `Service ${i + 1} – Åäö`, mileage: i, cost_amount: 10000, currency: "SEK",
      provider_name: "محمد – Сервис", description: "Müller Łódź – svenska åäö. ".repeat(12),
      source_type: "owner", has_document: false })), intervals: [],
  });
  const started = performance.now();
  const rssBefore = process.memoryUsage().rss;
  const pdf = await generateVehiclePdf(model);
  const pages = [...pdf.toString("latin1").matchAll(/\/Type \/Page\b/g)].length;
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.toString("latin1").trimEnd()).toMatch(/%%EOF$/);
  expect(pages).toBeGreaterThanOrEqual(count === 1 ? 1 : Math.ceil(count / 10));
  if (process.env.SERVICEBOK_PDF_BENCHMARK === "1") {
    console.info(JSON.stringify({ fixture: "pdf-scale", count, pages, bytes: pdf.length,
      milliseconds: Math.round(performance.now() - started), rssBefore, rssAfter: process.memoryUsage().rss }));
  }
}, 120000);
