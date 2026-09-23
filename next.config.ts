import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/vehicles/*/export": ["./assets/fonts/dejavu/*.ttf", "./assets/fonts/dejavu/LICENSE"] },
  logging: { incomingRequests: { ignore: [/^\/transfer\//] }, serverFunctions: false },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ] }, { source: "/transfer/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
};

export default nextConfig;
