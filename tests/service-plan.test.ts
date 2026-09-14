import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({access:vi.fn(),user:vi.fn(),rpc:vi.fn(),from:vi.fn(),refresh:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:mocks.user}));
vi.mock("@/lib/permissions/vehicle",()=>({requireVehicleAccess:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>mocks,createReadOnlyClient:async()=>mocks}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not-found");},redirect:(path:string)=>{throw new Error(`redirect:${path}`);}}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
import { intervalFormSchema, completionFormSchema, reminderFormSchema } from "@/lib/validation/service-plan";
import { getServiceIntervals,createServiceInterval,updateServiceInterval,completeServiceInterval,deactivateServiceInterval } from "@/services/service-intervals";
import { getReminders,createCustomReminder,setReminderStatus } from "@/services/reminders";
import { saveInterval,deactivateInterval } from "../app/(app)/vehicles/[vehicleId]/service/actions";
import { saveReminder } from "../app/(app)/reminders/actions";
const vehicle="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";
const input={name:" Olja ",category:"oil",distance_interval:"3000",month_interval:"12",last_completed_date:"2026-08-12",last_completed_mileage:"8420"};
const reminder={vehicle_id:vehicle,title:" Vinterdäck ",due_date:"2026-11-01",due_mileage:""};
function form(values:Record<string,string>){const result=new FormData();for(const [key,value] of Object.entries(values))result.set(key,value);return result;}
beforeEach(()=>{vi.resetAllMocks();mocks.user.mockResolvedValue({id:vehicle});mocks.access.mockResolvedValue({user:{id:vehicle},supabase:mocks});mocks.rpc.mockResolvedValue({data:id,error:null});});
afterEach(()=>vi.unstubAllEnvs());
describe("planning form validation",()=>{
  it.each([["3000",""],["","12"],["3000","12"]])("accepts distance/month/combined with optional baseline",(distance,months)=>{
    expect(intervalFormSchema.parse({...input,distance_interval:distance,month_interval:months,last_completed_date:"",last_completed_mileage:""})).toMatchObject({name:"Olja",last_completed_date:null,last_completed_mileage:null});
  });
  it.each([{distance_interval:"",month_interval:""},{distance_interval:"0"},{month_interval:"-1"},{month_interval:"1201"},{last_completed_mileage:"-1"},{last_completed_date:"2026-02-30"},{distance_interval:"2147483647",last_completed_mileage:"1"}])("rejects invalid interval and overflow",fields=>{
    expect(intervalFormSchema.safeParse({...input,...fields}).success).toBe(false);
  });
  it("requires custom due values and completion values; strips spoofed identity",()=>{
    expect(reminderFormSchema.safeParse({...reminder,due_date:""}).success).toBe(false);
    expect(reminderFormSchema.parse({...reminder,user_id:"forged"})).not.toHaveProperty("user_id");
    expect(completionFormSchema.safeParse({last_completed_date:"",last_completed_mileage:""}).success).toBe(false);
    expect(completionFormSchema.parse({last_completed_date:"",last_completed_mileage:"0"})).toEqual({last_completed_date:null,last_completed_mileage:0});
  });
});
describe("planning services and actions",()=>{
  it("checks ownership before all vehicle writes",async()=>{
    mocks.access.mockRejectedValue(new Error("not-found"));
    for(const action of [()=>createServiceInterval(vehicle,input),()=>updateServiceInterval(vehicle,id,input),()=>completeServiceInterval(vehicle,id,input),()=>deactivateServiceInterval(vehicle,id),()=>createCustomReminder(reminder),()=>setReminderStatus(vehicle,id,"completed")]) await expect(action()).rejects.toThrow("not-found");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes normalized interval data without author/source or mileage-history writes",async()=>{
    await createServiceInterval(vehicle,{...input,user_id:"forged",source:"system"});
    expect(mocks.rpc).toHaveBeenCalledWith("save_service_interval",{p_vehicle_id:vehicle,p_interval_id:null,p_name:"Olja",p_category:"oil",p_distance_interval:3000,p_month_interval:12,p_last_completed_date:"2026-08-12",p_last_completed_mileage:8420});
    await completeServiceInterval(vehicle,id,{last_completed_date:"2026-09-13",last_completed_mileage:"8000"});
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_service_interval",{p_vehicle_id:vehicle,p_interval_id:id,p_date:"2026-09-13",p_mileage:8000});
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("uses ownership-bound custom reminder RPC and hides raw errors",async()=>{
    await createCustomReminder({...reminder,user_id:"forged"});expect(mocks.rpc).toHaveBeenLastCalledWith("create_custom_reminder",{p_vehicle_id:vehicle,p_title:"Vinterdäck",p_due_date:"2026-11-01",p_due_mileage:null});
    mocks.rpc.mockResolvedValue({error:{message:"private error"}});
    expect(await saveReminder({},form(reminder))).toEqual({message:"Påminnelsen kunde inte sparas. Försök igen."});
  });
  it("returns validation errors without mutation and requires deactivation confirmation",async()=>{
    expect((await saveInterval(vehicle,null,false,{},form({...input,distance_interval:"",month_interval:""}))).errors?.distance_interval).toBeDefined();
    expect((await deactivateInterval(vehicle,id,false)).message).toContain("Bekräfta");expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("refreshes service plan, dashboard and reminders after successful interval completion",async()=>{
    await expect(saveInterval(vehicle,id,true,{},form(input))).rejects.toThrow(`redirect:/vehicles/${vehicle}/service`);
    expect(mocks.refresh.mock.calls).toEqual([[`/vehicles/${vehicle}`,"layout"],["/dashboard"],["/reminders"]]);
  });
  it("queries RLS views in priority order with bounded pagination and verified reminder identity",async()=>{
    const query={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn().mockResolvedValue({data:[],error:null})};
    query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.order.mockReturnValue(query);mocks.from.mockReturnValue(query);
    expect(await getServiceIntervals(vehicle,2)).toEqual({intervals:[],hasMore:false});expect(query.range).toHaveBeenCalledWith(30,60);
    expect(await getReminders(1,3)).toEqual({reminders:[],hasMore:false});expect(query.eq).toHaveBeenCalledWith("user_id",vehicle);expect(query.order).toHaveBeenCalledWith("priority");expect(query.range).toHaveBeenLastCalledWith(0,3);
    query.range.mockResolvedValue({data:null,error:{message:"raw"}});await expect(getReminders()).rejects.toThrow("Påminnelserna kunde inte hämtas.");
  });
});
