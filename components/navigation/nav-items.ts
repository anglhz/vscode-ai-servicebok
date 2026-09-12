import { Bell, CarFront, House, Plus, UserRound } from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Hem", icon: House },
  { href: "/vehicles", label: "Fordon", icon: CarFront },
  { href: "/new", label: "Ny", icon: Plus },
  { href: "/reminders", label: "Påminnelser", icon: Bell },
  { href: "/account", label: "Konto", icon: UserRound },
] as const;
