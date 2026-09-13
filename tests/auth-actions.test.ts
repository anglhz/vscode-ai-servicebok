import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { login, signup, logout } from "../app/(auth)/actions";

function form(values: Record<string, string>) { const data = new FormData(); Object.entries(values).forEach(([k, v]) => data.set(k, v)); return data; }
beforeEach(() => vi.resetAllMocks());

describe("server auth actions", () => {
  it("validates before contacting Auth", async () => {
    expect((await login({}, form({ email: "bad", password: "" }))).errors).toBeDefined();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("never returns passwords or raw auth errors", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "internal secret" } });
    const state = await login({}, form({ email: "a@example.com", password: "very-secret-password" }));
    expect(JSON.stringify(state)).not.toMatch(/internal secret|very-secret-password/);
    expect(state.message).toBeTruthy();
  });
  it("successful login invalidates cached pages and uses a fixed redirect", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    await expect(login({}, form({ email: "a@example.com", password: "valid-password", next: "https://evil.example" }))).rejects.toThrow("redirect:/dashboard");
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("signup waits for email confirmation when no session is returned", async () => {
    mocks.signUp.mockResolvedValue({ error: null, data: { session: null } });
    expect((await signup({}, form({ email: "a@example.com", password: "valid-password", confirmPassword: "valid-password", id: "attacker" }))).success).toBe(true);
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "a@example.com", password: "valid-password" });
  });
  it("logout revokes the current session and redirects only on success", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { message: "failure" } });
    expect((await logout()).message).toBeTruthy();
    mocks.signOut.mockResolvedValueOnce({ error: null });
    await expect(logout()).rejects.toThrow("redirect:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
