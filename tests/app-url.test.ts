import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getAppUrl } from "../lib/auth/app-url";
afterEach(() => vi.unstubAllEnvs());

it.each(["https://app.example", "https://preview.vercel.app/", "http://localhost:3000"])("accepts deployment origin %s", (origin) => {
  vi.stubEnv("APP_URL", origin);
  expect(getAppUrl()).toBe(new URL(origin).origin);
});
it.each(["", "invalid", "//evil.example", "http://app.example", "https://user:password@app.example", "https://app.example/auth/callback", "https://app.example?next=evil", "https://app.example#fragment"])("rejects invalid origin %s", (origin) => {
  vi.stubEnv("APP_URL", origin);
  expect(() => getAppUrl()).toThrow();
});
