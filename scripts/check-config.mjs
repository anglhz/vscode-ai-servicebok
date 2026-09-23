import { configurationIssues } from "../lib/config/validation.ts";

// Local command only: no network, mutations or secret values in output.
const staging = process.argv.includes("--staging");
if (process.argv.slice(2).some(arg => arg !== "--staging")) throw new Error("Usage: node --env-file=.env.local scripts/check-config.mjs [--staging]");
const env = { ...process.env, ...(staging ? { VERCEL_ENV: "preview" } : {}) };
const issues = ["app", "supabase", "billing", "lookup"].flatMap(feature => configurationIssues(feature, env));
for (const issue of issues) console.error(issue);
console.log(issues.length ? "Configuration check failed. No values were printed." : "Configuration shape OK. Credentials, project isolation and hosted connectivity are NOT verified.");
process.exitCode = issues.length ? 1 : 0;
