import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user:vi.fn(),access:vi.fn(),rpc:vi.fn(),from:vi.fn(),get:vi.fn(),has:vi.fn(),delete:vi.fn(),refresh:vi.fn(),signInWithPassword:vi.fn(),signUp:vi.fn(),exchangeCodeForSession:vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser:mocks.user }));
vi.mock("@/lib/permissions/vehicle", () => ({ requireVehicleAccess:mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createClient:async()=>({...mocks,auth:mocks}),createReadOnlyClient:async()=>mocks }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks }));
vi.mock("next/headers", () => ({ cookies:async()=>mocks }));
vi.mock("next/cache", () => ({ revalidatePath:mocks.refresh }));
vi.mock("next/navigation", () => ({ redirect:(path:string)=>{throw new Error(`redirect:${path}`);} }));
import { createVehicleTransfer, previewVehicleTransfer, acceptVehicleTransfer, cancelVehicleTransfer } from "@/services/vehicle-transfers";
import { startTransfer } from "../app/(app)/vehicles/[vehicleId]/transfer/actions";
import { acceptTransfer } from "../app/transfer/[token]/actions";
import { consumeTransferContinuation,transferCookieName } from "@/lib/auth/transfer-continuation";
import { GET as continueGET } from "../app/transfer/[token]/continue/route";
import { GET as callbackGET } from "../app/auth/callback/route";
import { login,signup } from "../app/(auth)/actions";
import { transferSelectionSchema,transferTokenSchema } from "@/lib/validation/transfer";
const id="11111111-1111-4111-8111-111111111111", token="ab".repeat(32),digest=createHash("sha256").update(token).digest("hex");
function form(values:Record<string,string>) { const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result; }
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("APP_URL","https://servicebok.example");mocks.user.mockResolvedValue({id});mocks.access.mockResolvedValue({user:{id},supabase:mocks});});
afterEach(()=>vi.unstubAllEnvs());

describe("transfer services and actions",()=>{
  it("validates token shape and document selection bounds",()=>{
    expect(transferTokenSchema.safeParse(token).success).toBe(true);
    expect(transferSelectionSchema.safeParse(Array(101).fill(id)).success).toBe(false);
    expect(transferSelectionSchema.safeParse(["invalid"]).success).toBe(false);
  });
  it("uses database-generated token once and a configured URL without client identity",async()=>{
    mocks.rpc.mockResolvedValue({data:[{id,token,expires_at:"2026-09-21T00:00:00Z"}],error:null});
    const result=await startTransfer(id,{},form({confirm:"yes",user_id:"forged",APP_URL:"https://evil.example"}));
    expect(result.url).toBe(`https://servicebok.example/transfer/${token}`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_vehicle_transfer",{p_vehicle_id:id,p_document_ids:[]});
  });
  it("checks owner authorization before create/cancel and user authentication before preview/accept",async()=>{
    mocks.access.mockRejectedValue(new Error("denied"));
    await expect(createVehicleTransfer(id,[])).rejects.toThrow("denied");
    await expect(cancelVehicleTransfer(id,id)).rejects.toThrow("denied");
    mocks.user.mockRejectedValue(new Error("login"));
    await expect(previewVehicleTransfer(token)).rejects.toThrow("login");
    await expect(acceptVehicleTransfer(token)).rejects.toThrow("login");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("sends hashes, never plaintext tokens, to preview and accept",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:id,error:null});
    expect(await previewVehicleTransfer(token)).toBeNull();expect(await acceptVehicleTransfer(token)).toBe(id);
    expect(mocks.rpc.mock.calls).toEqual([["server_preview_vehicle_transfer",{p_user_id:id,p_token_hash:digest}],["server_accept_vehicle_transfer",{p_user_id:id,p_token_hash:digest}]]);
    expect(limiter.mock.calls).toEqual([["transfer_preview"],["transfer_accept"]]);
  });
  it("requires confirmation for create and accept without calling the database",async()=>{
    expect((await startTransfer(id,{},new FormData())).message).toBeTruthy();
    expect((await acceptTransfer(token,{},new FormData())).message).toBeTruthy();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing APP_URL before issuing a one-time token",async()=>{
    vi.stubEnv("APP_URL","");await expect(createVehicleTransfer(id,[])).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("invalid tokens never reach RPC",async()=>{
    for(const value of ["", "https://evil.example",token+"/x"])await expect(acceptVehicleTransfer(value)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not return raw database errors or capabilities on failure",async()=>{
    mocks.rpc.mockResolvedValue({error:{message:`secret ${token}`},data:null});
    const state=await acceptTransfer(token,{},form({confirm:"yes"}));
    expect(state.message).toBeTruthy();expect(JSON.stringify(state)).not.toContain(token);expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("successful accept clears continuation, invalidates private pages and redirects to the existing vehicle",async()=>{
    mocks.rpc.mockResolvedValue({data:id,error:null});
    await expect(acceptTransfer(token,{},form({confirm:"yes"}))).rejects.toThrow(`redirect:/vehicles/${id}?transferred=1`);
    expect(mocks.delete).toHaveBeenCalledWith(transferCookieName);expect(mocks.refresh).toHaveBeenCalledWith("/","layout");
  });
});

describe("safe authentication continuation",()=>{
  it.each([undefined,"//evil.example","https://evil.example","../account",token+"?next=evil"])("ignores arbitrary destinations: %s",async(value)=>{
    mocks.get.mockReturnValue(value ? {value} : undefined);mocks.has.mockReturnValue(Boolean(value));
    expect(await consumeTransferContinuation()).toBe("/dashboard");
  });
  it("consumes a valid continuation exactly into the transfer route",async()=>{
    mocks.get.mockReturnValue({value:token});mocks.has.mockReturnValue(true);
    expect(await consumeTransferContinuation()).toBe(`/transfer/${token}`);expect(mocks.delete).toHaveBeenCalledWith(transferCookieName);
  });
  it.each(["login","signup"])("sets a private cookie and configured %s destination",async(mode)=>{
    const response=await continueGET(new NextRequest(`https://evil.example/transfer/${token}/continue?mode=${mode}&next=https://evil.example`),{params:Promise.resolve({token})});
    expect(response.headers.get("location")).toBe(`https://servicebok.example/${mode}`);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.cookies.get(transferCookieName)).toMatchObject({value:token,httpOnly:true,sameSite:"lax",path:"/",maxAge:604800});
  });
  it("resumes after password login without accepting automatically",async()=>{
    mocks.get.mockReturnValue({value:token});mocks.has.mockReturnValue(true);mocks.signInWithPassword.mockResolvedValue({error:null});
    await expect(login({},form({email:"b@example.com",password:"12345678"}))).rejects.toThrow(`redirect:/transfer/${token}`);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps continuation while signup awaits email confirmation; callback then resumes it",async()=>{
    mocks.get.mockReturnValue({value:token});mocks.has.mockReturnValue(true);mocks.signUp.mockResolvedValue({error:null,data:{session:null}});
    expect((await signup({},form({email:"b@example.com",password:"12345678",confirmPassword:"12345678"}))).success).toBe(true);
    expect(mocks.delete).not.toHaveBeenCalled();expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("https://servicebok.example/auth/callback");
    mocks.exchangeCodeForSession.mockResolvedValue({error:null});
    const response=await callbackGET(new NextRequest("https://evil.example/auth/callback?code=test"));
    expect(response.headers.get("location")).toBe(`https://servicebok.example/transfer/${token}`);expect(mocks.delete).toHaveBeenCalledWith(transferCookieName);
  });
  it("immediate signup sessions resume transfer while invalid confirmation cannot consume it",async()=>{
    mocks.get.mockReturnValue({value:token});mocks.has.mockReturnValue(true);mocks.signUp.mockResolvedValue({error:null,data:{session:{}}});
    await expect(signup({},form({email:"b@example.com",password:"12345678",confirmPassword:"12345678"}))).rejects.toThrow(`redirect:/transfer/${token}`);
    mocks.delete.mockClear();mocks.exchangeCodeForSession.mockResolvedValue({error:{message:"invalid"}});
    const response=await callbackGET(new NextRequest("https://servicebok.example/auth/callback?code=bad"));
    expect(response.headers.get("location")).toBe("https://servicebok.example/auth/confirmation-error");expect(mocks.delete).not.toHaveBeenCalled();
  });
});

const limiter = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/rate-limit")>(), enforceRateLimit: limiter }));
import { RateLimitExceededError } from "@/lib/rate-limit";

it.each(["deny", "database failure"])("transfer preview and accept fail generically before token RPC on %s", async failure => {
  limiter.mockRejectedValue(failure === "deny" ? new RateLimitExceededError(600) : new Error(`private ${token}`));
  await expect(previewVehicleTransfer(token)).rejects.toThrow();
  const state = await acceptTransfer(token, {}, form({ confirm: "yes", user_id: "forged" }));
  expect(state.message).toBe("Överföringen kunde inte accepteras. Länken kan ha gått ut, avbrutits eller redan använts. Logga in igen om din session har gått ut.");
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.refresh).not.toHaveBeenCalled();
});
