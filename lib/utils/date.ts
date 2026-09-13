export function todayInSweden() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}
