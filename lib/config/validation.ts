// Pure validation shared by feature boundaries and the local readiness command.
// Only fixed variable names/reasons leave this module, never supplied values.
type Environment = Record<string, string | undefined>;
export type ConfigFeature = "app" | "supabase" | "billing" | "lookup" | "cleanup";
export function configurationIssues(feature: ConfigFeature, env: Environment): string[] {
  const issues: string[] = [];
  const required = (name: string) => {
    if (!env[name]?.trim() || env[name] !== env[name]?.trim()) issues.push(`${name}: required, without surrounding whitespace`);
  };
  const url = (name: string, originOnly: boolean) => {
    required(name);
    try {
      const parsed = new URL(env[name] ?? "");
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
      const deployed = ["preview", "production"].includes(env.VERCEL_ENV ?? "");
      if ((parsed.protocol !== "https:" && !(local && !deployed && parsed.protocol === "http:")) ||
        parsed.username || parsed.password || parsed.search || parsed.hash || (originOnly && parsed.pathname !== "/")) throw new Error();
    } catch { issues.push(`${name}: valid HTTPS ${originOnly ? "origin" : "URL"} required (local HTTP only outside Vercel)`); }
  };
  if (feature === "cleanup") {
    required("CRON_SECRET"); required("SUPABASE_SERVICE_ROLE_KEY");
    if ((env.CRON_SECRET ?? "").length < 32) issues.push("CRON_SECRET: at least 32 characters required (generate 32 random bytes)");
  }
  if (feature === "app") url("APP_URL", true);
  if (feature === "supabase") {
    url("NEXT_PUBLIC_SUPABASE_URL", true); required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (key.startsWith("sb_secret_")) issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: privileged keys are forbidden");
    if (key.startsWith("eyJ")) {
      try {
        const payload = JSON.parse(atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
        if (payload.role !== "anon") issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: JWT role must be anon");
      } catch { issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY: malformed JWT"); }
    }
  }
  if (feature === "billing") {
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PREMIUM_MONTHLY_PRICE_ID", "STRIPE_PREMIUM_YEARLY_PRICE_ID", "SUPABASE_SERVICE_ROLE_KEY"]) required(name);
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY ?? "")) issues.push("STRIPE_SECRET_KEY: expected server API key");
    if (!/^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET ?? "")) issues.push("STRIPE_WEBHOOK_SECRET: expected signing secret");
    for (const name of ["STRIPE_PREMIUM_MONTHLY_PRICE_ID", "STRIPE_PREMIUM_YEARLY_PRICE_ID"]) {
      if (!/^price_[A-Za-z0-9]+$/.test(env[name] ?? "")) issues.push(name + ": expected Price ID");
    }
    if (env.STRIPE_PREMIUM_MONTHLY_PRICE_ID && env.STRIPE_PREMIUM_MONTHLY_PRICE_ID === env.STRIPE_PREMIUM_YEARLY_PRICE_ID) issues.push("STRIPE_PREMIUM_MONTHLY_PRICE_ID / STRIPE_PREMIUM_YEARLY_PRICE_ID: distinct prices required");
    if (env.VERCEL_ENV === "preview" && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? "")) issues.push("STRIPE_SECRET_KEY: preview requires test mode");
  }
  if (feature === "lookup") {
    const names = ["VEHICLE_API_BASE_URL", "VEHICLE_API_KEY", "VEHICLE_LOOKUP_SIGNING_SECRET"];
    if (!env.VEHICLE_PROVIDER && names.every(name => !env[name])) return issues;
    if (env.VEHICLE_PROVIDER !== "http-json") issues.push("VEHICLE_PROVIDER: http-json required, or leave all lookup variables empty");
    url("VEHICLE_API_BASE_URL", false); required("VEHICLE_API_KEY"); required("VEHICLE_LOOKUP_SIGNING_SECRET");
    if (new TextEncoder().encode(env.VEHICLE_LOOKUP_SIGNING_SECRET ?? "").length < 32) issues.push("VEHICLE_LOOKUP_SIGNING_SECRET: at least 32 bytes required");
  }
  return issues;
}
