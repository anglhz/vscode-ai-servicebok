import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { SellerTransferForm } from "@/components/vehicle-transfers/seller-form";
import { getVehicleForCurrentUser } from "@/services/vehicles";
import { getTransferDocumentChoices, getVehicleTransfer } from "@/services/vehicle-transfers";

export const metadata: Metadata = { title: "Överför fordon" };
export default async function SellerTransferPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const [vehicle, transfer, documents] = await Promise.all([getVehicleForCurrentUser(vehicleId), getVehicleTransfer(vehicleId), getTransferDocumentChoices(vehicleId)]);
  return <div className="max-w-xl">
    <Link href={`/vehicles/${vehicleId}`} className="mb-4 inline-flex min-h-11 items-center text-primary underline">Tillbaka till fordonet</Link>
    <PageHeader title="Överför fordon" description={`${vehicle.make} ${vehicle.model} · ${vehicle.registration_number ?? "Registreringsnummer saknas"}`} />
    <SellerTransferForm vehicleId={vehicleId} transfer={transfer} documents={documents} />
  </div>;
}
