import Link from "next/link";
import { getVehicleTransfer } from "@/services/vehicle-transfers";

export async function OwnershipSection({ vehicleId }: { vehicleId: string }) {
  let pending = false;
  let failed = false;
  try { pending = (await getVehicleTransfer(vehicleId))?.status === "pending"; } catch { failed = true; }
  return <section className="my-8 border-t pt-6">
    <h2 className="text-lg font-semibold">Ägarskap</h2>
    {pending && <p className="mt-2 text-sm">Överföring väntar</p>}
    {failed && <p className="mt-2 text-sm">Överföringsstatus kunde inte hämtas.</p>}
    <Link href={`/vehicles/${vehicleId}/transfer`} className="inline-flex min-h-12 items-center text-primary underline underline-offset-4">{pending ? "Visa överföring" : "Överför fordon"}</Link>
  </section>;
}
