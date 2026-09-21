import { inflateSync } from "node:zlib";
import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { assertGlyphCoverage,exportFont,pdfText } from "@/services/exports/fonts";
import { visualRuns } from "@/services/exports/bidi";
import { generateVehiclePdf } from "@/services/exports/pdf";
import { createVehicleExportModel } from "@/services/exports/model";

it.each(["Müller Łódź","محمد","Сервис","😀"])("embeds and maps Unicode %s in every free-text export field",async(value)=>{
  expect(pdfText(value)).toBe(value);
  for(const bold of [false,true]) {
    expect(()=>assertGlyphCoverage(value,bold)).not.toThrow();
    expect(exportFont(bold).font.layout(value).glyphs.every(glyph=>glyph.id!==0)).toBe(true);
  }
  const model=createVehicleExportModel({generated_at:"2026-09-20T10:00:00Z",
    vehicle:{registration_number:null,make:value,model:value,model_year:null,vehicle_type:"car",vin:null,current_mileage:null},
    events:[{event_date:"2026-09-20",category:"service",title:value,mileage:null,cost_amount:null,currency:"SEK",provider_name:value,description:value,source_type:"owner",has_document:false}],
    intervals:[{name:value,due_date:null,due_mileage:null,urgency:"unknown"}]});
  const pdf=await generateVehiclePdf(model),raw=pdf.toString("latin1");
  expect(raw).toContain("/FontFile2");
  const maps=[...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].flatMap(match=>{
    try{const text=inflateSync(Buffer.from(match[1],"latin1")).toString();return /beginbf(?:char|range)/.test(text)?[text]:[];}catch{return [];}
  }).join("\n").toLowerCase().replace(/\s+/g,"");
  // Validate the real PDF's Unicode mapping, not just the sanitizer's return value.
  for(const char of value.replace(/ /g,"")) {
    const utf16=Array.from({length:char.length},(_,i)=>char.charCodeAt(i).toString(16).padStart(4,"0")).join("");
    expect(maps).toContain(utf16);
  }
});
it("removes injected bidi/control characters but retains joining controls and line breaks",()=>{
  expect(pdfText("A\u202eB\u2066C\u0000\r\nمحمد\u200d\u200c")).toBe("ABC\nمحمد\u200d\u200c");
});
it("shapes Arabic as joined RTL glyphs and keeps logical text inside visual runs",()=>{
  const font=exportFont().font,run=font.layout("محمد");
  expect(run.direction).toBe("rtl");
  expect(run.glyphs.map(g=>g.id)).not.toEqual(font.glyphsForString("محمد").map(g=>g.id));
  expect(visualRuns("Verkstad: محمد أحمد 123")).toEqual(["Verkstad: ","123","محمد أحمد "]);
});
it("rejects missing glyphs explicitly rather than substituting question marks or tofu",async()=>{
  expect(pdfText("\u{10ffff}")).toBe("\u{10ffff}");
  expect(()=>assertGlyphCoverage("\u{10ffff}")).toThrow("PDF font does not support all supplied characters");
});
