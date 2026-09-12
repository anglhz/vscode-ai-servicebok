import { formatMileage } from "@/lib/utils/format";

export function MileageDisplay({ value }: { value?: number | null }) {
  return <span className="tabular-nums">{formatMileage(value)}</span>;
}
