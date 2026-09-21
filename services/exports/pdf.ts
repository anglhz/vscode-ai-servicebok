import "server-only";
import PDFDocument from "pdfkit";
import { exportFont, assertGlyphCoverage, pdfText } from "./fonts";
import { drawBidiText } from "./bidi";
export { pdfText } from "./fonts";
import { exportLabels, formatExportCost, formatExportDate, formatMileage, type VehicleExportData } from "./model";

export async function generateVehiclePdf(data: VehicleExportData): Promise<Buffer> {
  const document = new PDFDocument({ size:"A4", margins:{top:58,right:48,bottom:58,left:48}, bufferPages:true,
    info:{Title:"Servicebok - fordonshistorik",Author:"Servicebok",Creator:"Servicebok",CreationDate:new Date(data.generated_at),ModDate:new Date(data.generated_at)} });
  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve,reject) => {
    document.on("data",(chunk:Buffer)=>chunks.push(chunk)); document.on("end",()=>resolve(Buffer.concat(chunks))); document.on("error",reject);
  });
  const left=48, width=499.28, bottom=783.89, ink="#19252e", muted="#58636e", accent="#245b51";
  const ensure = (height:number) => { if(document.y + height > bottom) document.addPage(); };
  const text = (value:string,size=10,color=ink,bold=false) => {
    const clean=pdfText(value);assertGlyphCoverage(clean,bold);
    document.font(bold?"Export-Bold":"Export-Regular").fontSize(size).fillColor(color);
    if(/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(clean))drawBidiText(document,clean,left,width,bottom);
    else document.text(clean,left,document.y,{width,lineGap:3});
  };
  const rule = () => { ensure(18); document.moveTo(left,document.y+6).lineTo(left+width,document.y+6).strokeColor("#dce2e5").lineWidth(0.5).stroke();document.y+=20; };
  const section = (title:string) => { ensure(85);text(title,16,accent,true);document.y+=10; };
  const field = (label:string,value:string) => { text(`${label}: ${value}`);document.y+=3; };
  try {
    document.registerFont("Export-Regular",exportFont().bytes);
    document.registerFont("Export-Bold",exportFont(true).bytes);
    text("SERVICEBOK",10,accent,true);document.y+=12;
    text("Fordonets servicehistorik",25,ink,true);document.y+=8;
    text(`Genererad ${formatExportDate(data.generated_at)}`,9,muted);rule();
    const v=data.vehicle;
    text(`${v.make} ${v.model}`,19,ink,true);document.y+=8;
    field("Registreringsnummer",v.registration_number || "Saknas");
    field("Årsmodell",v.model_year?.toString() ?? "Ej angivet");field("Fordonstyp",exportLabels.vehicleType[v.vehicle_type]);
    if(v.vin) field("VIN",v.vin);
    field("Aktuellt miltal",formatMileage(v.current_mileage));rule();
    section("Sammanfattning");field("Servicehändelser",String(data.summary.eventCount));
    if(data.summary.firstDate) field("Första händelse",formatExportDate(data.summary.firstDate));
    if(data.summary.lastDate) field("Senaste händelse",formatExportDate(data.summary.lastDate));
    field("Dokumenterade kostnader",data.summary.costCount ? `${formatExportCost(data.summary.totalCostOre)} (${data.summary.costCount} poster med angiven kostnad)` : "Inga kostnader angivna");
    document.y+=8;
    text("Historiken är sammanställd från uppgifter registrerade i Servicebok. Poster kan vara registrerade av nuvarande eller tidigare ägare och innebär inte i sig extern verifiering.",9,muted);
    document.y+=6;text("Dokumentindikatorn gäller bilagor som den exporterande ägaren får läsa. Originalfiler och privata anteckningar ingår inte.",9,muted);rule();
    section("Servicehistorik - äldst först");
    if(!data.events.length) text("Ingen servicehistorik registrerad.",10,muted);
    for(const event of data.events) {
      ensure(125);
      text(`${formatExportDate(event.event_date)}  |  ${exportLabels.category[event.category]}`,9,accent,true);document.y+=4;
      text(event.title,13,ink,true);document.y+=4;
      text(`${formatMileage(event.mileage)}  |  ${event.cost_amount === null ? "Kostnad saknas" : formatExportCost(event.cost_amount)}`,10);
      text(`${exportLabels.source[event.source_type]}  |  ${event.has_document ? "Dokument bifogat" : "Inget dokument bifogat"}`,9,muted);
      if(event.provider_name) {document.y+=4;text(`Verkstad / utförare: ${event.provider_name}`);}
      if(event.description) {document.y+=6;text(event.description);}
      rule();
    }
    section("Aktuell serviceplan");
    text("Planerade intervall - inte dokumentation av utfört arbete.",9,muted);document.y+=12;
    if(!data.intervals.length) text("Inga aktiva serviceintervall.",10,muted);
    for(const interval of data.intervals) {
      ensure(90);text(interval.name,12,ink,true);document.y+=4;
      text(`Status: ${exportLabels.urgency[interval.urgency]}`,10,accent);
      const due=[interval.due_mileage === null ? null : `Nästa vid ${formatMileage(interval.due_mileage)}`,interval.due_date ? `senast ${formatExportDate(interval.due_date)}` : null].filter(Boolean);
      text(due.length ? due.join(" eller ") : "Utgångsvärden saknas.");rule();
    }
    const range=document.bufferedPageRange();
    for(let index=0;index<range.count;index++) {
      document.switchToPage(index);document.font("Export-Regular").fontSize(8).fillColor(muted);
      if(index>0) document.text("SERVICEBOK | Fordonshistorik",left,30,{lineBreak:false});
      document.text(pdfText(`Genererad ${formatExportDate(data.generated_at)}`),left,810,{lineBreak:false});
      document.text(`Sida ${index+1} / ${range.count}`,left+width-70,810,{lineBreak:false});
    }
    document.end();
  } catch {
    document.destroy(new Error("PDF kunde inte skapas. Försök igen."));
  }
  return completed;
}
