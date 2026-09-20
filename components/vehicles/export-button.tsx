"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({ vehicleId }: { vehicleId:string }) {
  const [pending,setPending]=useState(false),[message,setMessage]=useState("");
  async function download() {
    setPending(true);setMessage("");
    try {
      const response=await fetch(`/vehicles/${encodeURIComponent(vehicleId)}/export`,{method:"POST",cache:"no-store"});
      if(!response.ok || !response.headers.get("Content-Type")?.startsWith("application/pdf")) throw new Error("export failed");
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      const filename=response.headers.get("Content-Disposition")?.match(/filename="(servicebok_[A-Za-z0-9_]+\.pdf)"/)?.[1] ?? "servicebok_fordon.pdf";
      const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage("PDF-filen har laddats ner.");
    } catch {setMessage("PDF kunde inte skapas. Försök igen.");}
    finally {setPending(false);}
  }
  return <div className="mb-6 space-y-2"><Button type="button" variant="outline" disabled={pending} aria-busy={pending} onClick={download} className="min-h-12"><Download aria-hidden className="size-4" />{pending ? "Skapar PDF…" : "Exportera servicebok"}</Button>
    {message && <p role="status" className="text-sm">{message}</p>}</div>;
}
