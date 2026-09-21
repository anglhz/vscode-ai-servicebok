import { mkdirSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { createVehicleExportModel } from "@/services/exports/model";
import { generateVehiclePdf } from "@/services/exports/pdf";
const vehicle={registration_number:"ABC123",make:"Volvo",model:"V60",model_year:2021,vehicle_type:"car",vin:"YV1TEST12345678901",current_mileage:12450};
const event={event_date:"2024-08-12",category:"service",title:"Ordinarie service",mileage:8420,cost_amount:429500,currency:"SEK",provider_name:"Exempelverkstaden",description:"Motorolja, oljefilter och kupéfilter bytta. Kontroll av bromsar och vätskor.",source_type:"owner",has_document:true};
const base={generated_at:"2026-09-20T10:00:00Z",vehicle,events:[event,{...event,event_date:"2026-01-18",category:"brakes",title:"Bromsar fram",mileage:11930,cost_amount:680025,source_type:"previous_owner",has_document:false}],
  intervals:[{name:"Olja och filter",due_date:"2027-08-12",due_mileage:15000,urgency:"ok"},{name:"Bromsvätska",due_date:null,due_mileage:null,urgency:"unknown"}]};
const cases=[
  {name:"unicode",data:{...base,vehicle:{...vehicle,make:"Müller Łódź",model:"Сервис محمد 😀"},events:[{...event,title:"Åäö – Müller Łódź – Сервис",provider_name:"محمد أحمد",description:"Svenska: ÅÄÖ åäö – ‘typografi’… €\nPolska: Müller Łódź\nالعربية: محمد أحمد\nКириллица: Сервис\nEmoji: 😀\n"+"محمد أحمد – Сервис – Müller Łódź. ".repeat(35)}],intervals:[{name:"Service – محمد – Сервис",due_date:null,due_mileage:null,urgency:"unknown"}]}},
  {name:"kort-historik",data:base},
  {name:"lang-historik",data:{...base,events:Array.from({length:70},(_,n)=>({...event,title:`Servicehändelse ${n+1}`,event_date:`${1950+n}-08-12`,description:`Post ${n+1}. ${event.description}`}))}},
  {name:"langa-beskrivningar",data:{...base,vehicle:{...vehicle,make:"Långt fordonsnamn ".repeat(5),model:"Modell med lång beteckning ".repeat(3)},events:[{...event,title:"Utförligt dokumenterad service och reparation ".repeat(3),provider_name:"En lång verkstadsbeteckning ".repeat(5),description:"Åäö: Service med utförlig beskrivning och radbrytning.\n".repeat(85)+"SLUTMARKOR_A"},{...event,title:"Text utan mellanslag",description:"ABCDEFGHIJ".repeat(499)+"SLUT_B"}]}},
  {name:"utan-registreringsnummer",data:{...base,vehicle:{...vehicle,registration_number:null,vin:null,current_mileage:null,model_year:null},events:[],intervals:[]}},
];
it.each(cases)("renders QA fixture $name",async({name,data})=>{
  const model=createVehicleExportModel(data),pdf=await generateVehiclePdf(model);
  expect(pdf.subarray(0,5).toString()).toBe("%PDF-");expect(pdf.toString("latin1")).toContain("%%EOF");
  // Optional local visual review output, never written by production or checked into Git.
  if(process.env.SERVICEBOK_PDF_QA_DIR){mkdirSync(process.env.SERVICEBOK_PDF_QA_DIR,{recursive:true});writeFileSync(join(process.env.SERVICEBOK_PDF_QA_DIR,`${name}.pdf`),pdf);}
});
