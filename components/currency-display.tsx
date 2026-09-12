import { formatCurrency } from "@/lib/utils/format";

export function CurrencyDisplay({ amountInOre }: { amountInOre?: number | null }) {
  return <span className="tabular-nums">{formatCurrency(amountInOre)}</span>;
}
