import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { RegistrationNumber } from "@/components/vehicles/registration-number";
import { MileageDisplay } from "@/components/mileage-display";
import type { Vehicle } from "@/lib/validation/vehicle";

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return <Link href={`/vehicles/${vehicle.id}`} className="flex min-w-0 items-center justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div className="min-w-0 space-y-3">
      <h2 className="break-words text-lg font-semibold">{vehicle.make} {vehicle.model}</h2>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {vehicle.registration_number && <RegistrationNumber value={vehicle.registration_number} />}
        {vehicle.model_year !== null && <span>Årsmodell {vehicle.model_year}</span>}
        {vehicle.current_mileage !== null && <MileageDisplay value={vehicle.current_mileage} />}
      </div>
    </div>
    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>;
}
