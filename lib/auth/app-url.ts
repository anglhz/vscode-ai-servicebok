import "server-only";

/** Deployment-owned origin, never request headers or form data. */
export function getAppUrl(): string {
  const configured = process.env.APP_URL;
  if (!configured) throw new Error("APP_URL must be configured.");
  const url = new URL(configured);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !["preview", "production"].includes(process.env.VERCEL_ENV ?? "");
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_URL must be an HTTPS origin (HTTP is allowed on localhost).");
  }
  return url.origin;
}
