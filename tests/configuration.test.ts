import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { configurationIssues } from "@/lib/config/validation";
import { getAppUrl } from "@/lib/auth/app-url";
import { getStripe } from "@/lib/stripe/server";
import { logBilling } from "@/lib/observability/billing";
import nextConfig from "../next.config";
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
const env={APP_URL:"https://staging.example",NEXT_PUBLIC_SUPABASE_URL:"https://test.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"sb_publishable_fixture",SUPABASE_SERVICE_ROLE_KEY:"fixture",STRIPE_SECRET_KEY:"sk_test_fixture",STRIPE_WEBHOOK_SECRET:"whsec_fixture",STRIPE_PREMIUM_PRICE_ID:"price_fixture",VERCEL_ENV:"preview"};
it("accepts complete staging config and disabled optional lookup",()=>{for(const feature of ["app","supabase","billing","lookup"] as const)expect(configurationIssues(feature,env)).toEqual([]);});
it.each(["STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_PREMIUM_PRICE_ID","SUPABASE_SERVICE_ROLE_KEY"])("rejects partial billing missing %s",name=>{expect(configurationIssues("billing",{...env,[name]:""}).join()).toContain(name);});
it("rejects live Stripe keys in preview",()=>{expect(configurationIssues("billing",{...env,STRIPE_SECRET_KEY:"sk_live_fixture"}).join()).toContain("test mode");});
it("missing webhook config fails before Stripe initialization without logging values",()=>{
  for(const [name,value] of Object.entries(env))vi.stubEnv(name,value);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET","");const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  expect(()=>getStripe()).toThrow("configuration");expect(JSON.stringify(log.mock.calls)).toContain("STRIPE_WEBHOOK_SECRET");expect(JSON.stringify(log.mock.calls)).not.toContain("sk_test_fixture");
});
it.each(["preview","production"])("APP_URL refuses local HTTP on Vercel %s",deployment=>{vi.stubEnv("VERCEL_ENV",deployment);vi.stubEnv("APP_URL","http://localhost:3000");expect(()=>getAppUrl()).toThrow();expect(configurationIssues("app",{...env,APP_URL:"http://localhost:3000",VERCEL_ENV:deployment}).length).toBeGreaterThan(0);});
it("configuration diagnostics never echo malformed URL credentials",()=>{const issues=configurationIssues("app",{APP_URL:"https://user:private-password@example.test/path"});expect(issues.join()).not.toContain("private-password");expect(issues.length).toBeGreaterThan(0);});
it("rejects a privileged key in the public Supabase variable",()=>{const jwt=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({role:"service_role"})).toString("base64url")}.fixture`;for(const key of ["sb_secret_fixture",jwt])expect(configurationIssues("supabase",{...env,NEXT_PUBLIC_SUPABASE_ANON_KEY:key}).length).toBeGreaterThan(0);});
it("partial provider and short signing secret produce fixed actionable issues",()=>{const issues=configurationIssues("lookup",{VEHICLE_PROVIDER:"http-json",VEHICLE_API_KEY:"sensitive",VEHICLE_LOOKUP_SIGNING_SECRET:"tiny"});expect(issues.join()).toContain("VEHICLE_API_BASE_URL");expect(issues.join()).toContain("32 bytes");expect(issues.join()).not.toMatch(/sensitive|tiny/);});
it("complete lookup configuration is accepted",()=>{expect(configurationIssues("lookup",{...env,VEHICLE_PROVIDER:"http-json",VEHICLE_API_BASE_URL:"https://provider.example/api",VEHICLE_API_KEY:"fixture",VEHICLE_LOOKUP_SIGNING_SECRET:"x".repeat(32)})).toEqual([]);});
it("billing logs retain only allowed identifiers and categories, never extra payload fields",()=>{
  const log=vi.spyOn(console,"warn").mockImplementation(()=>{});
  logBilling("processing_error",{id:"evt_123",type:"invoice.paid",body:"secret body",secret:"sk_test_private"} as {id:string;type:string});
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({category:"stripe_webhook",outcome:"processing_error",event_id:"evt_123",event_type:"invoice.paid"});
  logBilling("invalid_signature",{id:"evt_123\nsecret",type:"arbitrary-secret"});expect(log.mock.calls[1][0]).not.toContain("secret");
});
it("global anti-framing/nosniff headers and private transfer headers coexist",async()=>{
  const rules=await nextConfig.headers!();const global=rules.find(r=>r.source==="/:path*")!,transfer=rules.find(r=>r.source==="/transfer/:path*")!;
  expect(global.headers).toContainEqual({key:"X-Content-Type-Options",value:"nosniff"});expect(global.headers).toContainEqual({key:"Content-Security-Policy",value:"frame-ancestors 'none'"});
  expect(transfer.headers).toContainEqual({key:"Cache-Control",value:"private, no-store"});expect(transfer.headers).toContainEqual({key:"X-Robots-Tag",value:"noindex, nofollow, noarchive"});
});
