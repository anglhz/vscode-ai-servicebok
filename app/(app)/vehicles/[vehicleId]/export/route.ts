import { getCurrentUser } from "@/lib/auth/session";
import { requireVehicleAccess } from "@/lib/permissions/vehicle";
import { getVehicleExportData } from "@/services/exports/data";
import { exportFilename } from "@/services/exports/model";
import { generateVehiclePdf } from "@/services/exports/pdf";
import { requirePremiumUser, PremiumRequiredError } from "@/services/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control":"private, no-store", "CDN-Cache-Control":"no-store", "Vercel-CDN-Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
export async function POST(_request:Request, { params }: { params:Promise<{vehicleId:string}> }) {
  try {
    if(!await getCurrentUser()) return Response.json({message:"PDF kunde inte skapas. Försök igen."},{status:401,headers});
    await requirePremiumUser();
    const {vehicleId}=await params;
    const data=await getVehicleExportData(vehicleId);
    const pdf=await generateVehiclePdf(data);
    // Recheck after rendering: an ownership transfer during generation must not return the PDF.
    await requireVehicleAccess(vehicleId);
    return new Response(new Uint8Array(pdf),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${exportFilename(data)}"`}});
  } catch (error) {
    if (error instanceof PremiumRequiredError) return Response.json({message:error.message,premiumRequired:true},{status:403,headers});
    return Response.json({message:"PDF kunde inte skapas. Försök igen."},{status:500,headers});
  }
}
