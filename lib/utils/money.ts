/** Decimal text -> integer öre without floating point multiplication. */
export function kronorToOre(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{1,8}([,.]\d{1,2})?$/.test(text)) throw new Error("Ange kronor med högst två decimaler.");
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const ore = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  if (ore > BigInt(2147483647)) throw new Error("Kostnaden får vara högst 21 474 836,47 kr.");
  return Number(ore);
}
export function oreToKronorInput(value: number | null): string {
  return value === null ? "" : `${Math.floor(value / 100)},${String(value % 100).padStart(2, "0")}`;
}
