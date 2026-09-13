import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks = vi.hoisted(()=>({access:vi.fn(),rpc:vi.fn(),from:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/permissions/vehicle",()=>({requireVehicleAccess:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>mocks}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not-found");},redirect:(url:string)=>{throw new Error(`redirect:${url}`);}}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
import { createServiceEvent, updateServiceEvent, deleteServiceEvent, getServiceEventForVehicle, getServiceEventsForVehicle } from "@/services/service-events";
import { saveEvent, removeEvent } from "../app/(app)/vehicles/[vehicleId]/events/actions";
const v="11111111-1111-4111-8111-111111111111", e="22222222-2222-4222-8222-222222222222";
const input={category:"service",title:"Service",event_date:"2025-01-01",mileage:"100",cost:"4295,50",provider_name:"",description:"",notes:""};
const event={id:e,vehicle_id:v,category:"service",title:"Service",event_date:"2025-01-01",mileage:100,cost_amount:429550,currency:"SEK",provider_name:null,description:null,notes:null,source_type:"owner",created_at:"2025-01-01T12:00:00Z"};
function form(values:Record<string,string>=input){const f=new FormData();for(const [k,val] of Object.entries(values))f.set(k,val);return f;}
function query(data:unknown,error:unknown=null){
  const q={select:vi.fn(),eq:vi.fn(),is:vi.fn(),order:vi.fn(),range:vi.fn(),maybeSingle:vi.fn()};
  for(const method of [q.select,q.eq,q.is,q.order])method.mockReturnValue(q);
  q.range.mockResolvedValue({data,error});q.maybeSingle.mockResolvedValue({data,error});return q;
}
beforeEach(()=>{vi.resetAllMocks();mocks.access.mockResolvedValue({supabase:mocks,user:{id:"verified"}});mocks.rpc.mockResolvedValue({data:e,error:null});});
describe("service history data access",()=>{
  it("checks ownership for every operation and stops before database access if denied",async()=>{
    mocks.access.mockRejectedValue(new Error("not-found"));
    for(const operation of [()=>createServiceEvent(v,input),()=>updateServiceEvent(v,e,input),()=>deleteServiceEvent(v,e),()=>getServiceEventForVehicle(v,e),()=>getServiceEventsForVehicle(v)])await expect(operation()).rejects.toThrow("not-found");
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
  });
  it("passes integer öre and normalized optional fields, never client attribution",async()=>{
    await createServiceEvent(v,{...input,user_id:"attacker",created_by_user_id:"attacker",source_type:"system",vehicle_id:"other"});
    expect(mocks.rpc).toHaveBeenCalledWith("create_service_event",{p_vehicle_id:v,p_category:"service",p_title:"Service",p_event_date:"2025-01-01",p_mileage:100,p_cost_amount:429550,p_provider_name:null,p_description:null,p_notes:null});
    await updateServiceEvent(v,e,input);expect(mocks.rpc).toHaveBeenLastCalledWith("update_service_event",expect.objectContaining({p_vehicle_id:v,p_event_id:e}));
  });
  it("validates service input even outside the action",async()=>{
    await expect(createServiceEvent(v,{...input,cost:"NaN"})).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("scopes detail to both vehicle and event and excludes soft deleted records",async()=>{
    const q=query(event);mocks.from.mockReturnValue(q);
    expect(await getServiceEventForVehicle(v,e)).toEqual(event);
    expect(q.eq.mock.calls).toEqual([["vehicle_id",v],["id",e]]);expect(q.is).toHaveBeenCalledWith("deleted_at",null);
    mocks.from.mockReturnValue(query(null));await expect(getServiceEventForVehicle(v,e)).rejects.toThrow("not-found");
    await expect(getServiceEventForVehicle(v,"invalid")).rejects.toThrow("not-found");
  });
  it("orders timeline, bounds its page size and distinguishes failures from empty history",async()=>{
    const q=query(Array.from({length:31},()=>event));mocks.from.mockReturnValue(q);
    const result=await getServiceEventsForVehicle(v,2);expect(result.events).toHaveLength(30);expect(result.hasMore).toBe(true);
    expect(q.range).toHaveBeenCalledWith(30,60);
    expect(q.order.mock.calls.slice(0,2)).toEqual([["event_date",{ascending:false}],["created_at",{ascending:false}]]);
    mocks.from.mockReturnValue(query(null,{message:"private"}));await expect(getServiceEventsForVehicle(v)).rejects.toThrow("Historiken kunde inte hämtas.");
  });
  it("deletes only through the scoped soft delete RPC",async()=>{
    await deleteServiceEvent(v,e);expect(mocks.rpc).toHaveBeenCalledWith("soft_delete_service_event",{p_vehicle_id:v,p_event_id:e});
  });
});
describe("service history actions",()=>{
  it("returns field errors before mutation",async()=>{
    expect((await saveEvent(v,null,{},form({...input,title:""}))).errors?.title).toBeDefined();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("returns retryable messages without private database errors",async()=>{
    mocks.rpc.mockResolvedValue({error:{message:"private notes and database details"}});
    expect(await saveEvent(v,null,{},form())).toEqual({message:"Händelsen kunde inte sparas. Försök igen."});
    expect(await removeEvent(v,e,{},form({confirm:"yes"}))).toEqual({message:"Händelsen kunde inte tas bort. Försök igen."});
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("refreshes related routes and redirects after successful create/update",async()=>{
    for(const id of [null,e]) await expect(saveEvent(v,id,{},form())).rejects.toThrow(`redirect:/vehicles/${v}/events/${e}`);
    expect(mocks.refresh).toHaveBeenCalledWith(`/vehicles/${v}`,"layout");expect(mocks.refresh).toHaveBeenCalledWith("/dashboard");
  });
  it("requires explicit deletion confirmation and returns to vehicle after success",async()=>{
    expect((await removeEvent(v,e,{},form())).message).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
    await expect(removeEvent(v,e,{},form({confirm:"yes"}))).rejects.toThrow(`redirect:/vehicles/${v}`);
  });
});
