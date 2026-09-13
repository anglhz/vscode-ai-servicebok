import Link from "next/link";
import { BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
    <Link href="/" className="mb-8 flex min-h-12 items-center justify-center gap-3 text-lg font-semibold"><BookOpen aria-hidden className="size-6 text-primary" />Servicebok</Link>
    <section className="rounded-xl border bg-card p-6">{children}</section>
  </main>;
}
