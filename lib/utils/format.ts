export function formatMileage(mileage: number | null | undefined): string {
  if (mileage == null) return "Miltal saknas";
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(mileage)} mil`;
}

/** Amount is stored in öre, matching DATABASE.md. */
export function formatCurrency(amountInOre: number | null | undefined): string {
  if (amountInOre == null) return "Kostnad saknas";
  return new Intl.NumberFormat("sv-SE", {
    style: "currency", currency: "SEK",
    minimumFractionDigits: amountInOre % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountInOre / 100);
}

export function normalizeRegistrationNumber(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}
