import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ConfirmationErrorPage() {
  return <main className="mx-auto max-w-md space-y-4 px-4 py-12">
    <h1 className="text-2xl font-semibold">Bekräftelsen kunde inte slutföras</h1>
    <p>Länken kan ha gått ut eller öppnats i en annan webbläsare. Öppna bekräftelsen i samma webbläsare som du använde när du skapade kontot. Om kontot redan är bekräftat kan du logga in.</p>
    <Button asChild className="min-h-12"><Link href="/login">Till inloggning</Link></Button>
  </main>;
}
