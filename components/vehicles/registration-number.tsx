import { normalizeRegistrationNumber } from "@/lib/utils/format";

export function RegistrationNumber({ value }: { value?: string | null }) {
  const registration = value ? normalizeRegistrationNumber(value) : "";
  return <span className="inline-flex rounded-md border bg-card px-2 py-1 font-mono text-sm font-semibold tracking-wide">{registration || "Registreringsnummer saknas"}</span>;
}
