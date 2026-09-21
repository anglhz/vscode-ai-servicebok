import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: { "/vehicles/*/export": ["./assets/fonts/dejavu/*.ttf", "./assets/fonts/dejavu/LICENSE"] },
  logging: { incomingRequests: { ignore: [/^\/transfer\//] }, serverFunctions: false },
  async headers() {
    return [{ source: "/transfer/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ] }];
  },
};

export default nextConfig;
