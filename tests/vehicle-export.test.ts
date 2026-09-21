import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({access:vi.fn(),rpc:vi.fn(),user:vi.fn()}));
const premium = vi.hoisted(() => vi.fn());
vi.mock("@/services/subscriptions", () => ({requirePremiumUser:premium,PremiumRequiredError:class extends Error {}}));
import { PremiumRequiredError } from "@/services/subscriptions";
vi.mock("@/lib/permissions/vehicle",()=>({requireVehicleAccess:mocks.access}));
vi.mock("@/lib/auth/session",()=>({getCurrentUser:mocks.user}));
import { createVehicleExportModel, exportFilename, exportLabels, formatExportCost, formatExportDate, formatMileage } from "@/services/exports/model";
import { generateVehiclePdf, pdfText } from "@/services/exports/pdf";
import { getVehicleExportData } from "@/services/exports/data";
import { POST } from "../app/(app)/vehicles/[vehicleId]/export/route";
const id="11111111-1111-4111-8111-111111111111";
const event={event_date:"2026-09-20",category:"service",title:"Olja och filter",mileage:12450,cost_amount:12345,currency:"SEK",provider_name:"Verkstaden",description:"Bytte olja.",source_type:"owner",has_document:true};
const input={generated_at:"2026-09-20T10:00:00Z",vehicle:{registration_number:"ABC123",make:"Volvo",model:"V60",model_year:2021,vehicle_type:"car",vin:"VIN123",current_mileage:12450},events:[event],intervals:[{name:"Olja",due_date:"2027-09-20",due_mileage:15000,urgency:"ok"}]};
beforeEach(()=>{vi.resetAllMocks();mocks.access.mockResolvedValue({supabase:{rpc:mocks.rpc},user:{id}});mocks.user.mockResolvedValue({id});mocks.rpc.mockResolvedValue({data:input,error:null});});
afterEach(()=>vi.unstubAllEnvs());

describe("minimal export model and presentation",()=>{
  it("strips notes, account data, ownership ids, document filenames/paths and personal reminders",()=>{
    const model=createVehicleExportModel({...input,reminders:[{title:"private insurance"}],owners:[{email:"secret@example.test"}],vehicle:{...input.vehicle,id},
      events:[{...event,notes:"PRIVATE NOTE",created_by_user_id:id,documents:[{file_name:"Private name.pdf",storage_path:"secret/path"}]}]});
    expect(JSON.stringify(model)).not.toMatch(/PRIVATE NOTE|secret|Private name|insurance|created_by_user|ownership|11111111/);
    expect(model.events[0]).toEqual(event);
  });
  it("orders oldest first and derives count and first/last dates",()=>{
    const model=createVehicleExportModel({...input,events:[event,{...event,event_date:"2020-01-01"}]});
    expect(model.events.map(e=>e.event_date)).toEqual(["2020-01-01","2026-09-20"]);
    expect(model.summary).toMatchObject({eventCount:2,firstDate:"2020-01-01",lastDate:"2026-09-20"});
  });
  it("sums only known costs exactly in integer ore, including zero",()=>{
    const model=createVehicleExportModel({...input,events:[{...event,cost_amount:10},{...event,cost_amount:20},{...event,cost_amount:0},{...event,cost_amount:null}]});
    expect(model.summary).toMatchObject({costCount:3,totalCostOre:"30"});expect(formatExportCost(model.summary.totalCostOre)).toBe("0,30 SEK");
    expect(formatExportCost("900719925474099312345").replace(/\s/g," ")).toBe("9 007 199 254 740 993 123,45 SEK");
  });
  it("handles empty history without inventing dates or costs",()=>{
    expect(createVehicleExportModel({...input,events:[],intervals:[]}).summary).toEqual({eventCount:0,firstDate:null,lastDate:null,totalCostOre:"0",costCount:0});
  });
  it.each([["owner","Registrerad av ägaren"],["previous_owner","Tidigare ägare"],["imported","Importerad"],["system","Systemregistrerad"]] as const)("uses source label %s without verification claims",(source,label)=>{
    expect(exportLabels.source[source]).toBe(label);
  });
  it("formats Swedish mil and Stockholm generation dates across year boundaries",()=>{
    expect(formatMileage(12450).replace(/\s/g," ")).toBe("12 450 mil");
    expect(formatExportDate("2026-12-31T23:30:00Z")).toBe("1 januari 2027");
  });
  it.each([[null,"fordon"],["abc 123","ABC123"],["../../\r\n\"XYZ789","XYZ789"],["///","fordon"]])("sanitizes filename for %s",(registration,expected)=>{
    const model=createVehicleExportModel({...input,vehicle:{...input.vehicle,registration_number:registration}});
    expect(exportFilename(model)).toBe(`servicebok_${expected}_2026.pdf`);
  });
  it("keeps document booleans and service intervals without full document or reminder objects",()=>{
    const model=createVehicleExportModel(input);expect(model.events[0].has_document).toBe(true);expect(model.intervals).toEqual(input.intervals);
  });
  it("preserves Swedish text, typography and emoji",()=>{
    expect(pdfText("Åäö – ‘test’… 😀")).toBe("Åäö – ‘test’… 😀");
  });
  it("renders valid multipage A4 PDF with full long description and no per-event truncation",async()=>{
    const model=createVehicleExportModel({...input,events:Array.from({length:70},(_,n)=>({...event,title:`Service ${n}`,description:n===0?"Lång beskrivning ".repeat(250):event.description}))});
    const pdf=await generateVehiclePdf(model);
    expect(pdf.subarray(0,5).toString()).toBe("%PDF-");expect(pdf.toString("latin1")).toContain("%%EOF");
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g)||[]).length).toBeGreaterThan(5);
  });
});

describe("scoped export service and download route",()=>{
  it("Free cannot directly export PDF, before any vehicle data is queried",async()=>{
    premium.mockRejectedValue(new PremiumRequiredError());
    const response=await POST(new Request("http://localhost/export",{method:"POST"}),{params:Promise.resolve({vehicleId:id})});
    expect(response.status).toBe(403);expect((await response.json()).premiumRequired).toBe(true);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses one user-scoped RPC instead of per-event or browser queries",async()=>{
    expect((await getVehicleExportData(id)).summary.eventCount).toBe(1);
    expect(mocks.access).toHaveBeenCalledWith(id);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_vehicle_export_data",{p_vehicle_id:id});
  });
  it("denies another vehicle before querying export data",async()=>{
    mocks.access.mockRejectedValue(new Error("not found"));await expect(getVehicleExportData(id)).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns an attachment with PDF MIME and private/no-store CDN headers",async()=>{
    const response=await POST(new Request("http://localhost/export",{method:"POST"}),{params:Promise.resolve({vehicleId:id})});
    expect(response.status).toBe(200);expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="servicebok_ABC123_2026.pdf"');
    for(const header of ["Cache-Control","CDN-Cache-Control","Vercel-CDN-Cache-Control"])expect(response.headers.get(header)).toContain("no-store");
    expect(response.headers.get("Cache-Control")).toContain("private");expect(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString()).toBe("%PDF-");
    expect(mocks.access).toHaveBeenCalledTimes(2);
  });
  it("blocks lost ownership after generation and never returns a partial PDF",async()=>{
    mocks.access.mockResolvedValueOnce({supabase:{rpc:mocks.rpc}}).mockRejectedValueOnce(new Error("private database details"));
    const response=await POST(new Request("http://localhost/export",{method:"POST"}),{params:Promise.resolve({vehicleId:id})});
    expect(response.status).toBe(500);expect(await response.json()).toEqual({message:"PDF kunde inte skapas. Försök igen."});
  });
  it("requires an authenticated session and keeps error responses uncached",async()=>{
    mocks.user.mockResolvedValue(null);const response=await POST(new Request("http://localhost/export",{method:"POST"}),{params:Promise.resolve({vehicleId:id})});
    expect(response.status).toBe(401);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([{data:null,error:null},{data:null,error:{message:"secret"}},{data:{notes:"secret"},error:null}])("fails closed on unavailable or malformed snapshots",async(result)=>{
    mocks.rpc.mockResolvedValue(result);const response=await POST(new Request("http://localhost/export",{method:"POST"}),{params:Promise.resolve({vehicleId:id})});
    expect(response.status).toBe(500);expect(await response.text()).not.toContain("secret");
  });
});
