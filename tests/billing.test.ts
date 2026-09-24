import { afterEach,beforeEach,expect,it,vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({user:vi.fn(),lease:vi.fn(),operation:vi.fn(),find:vi.fn(),processed:vi.fn(),apply:vi.fn(),customer:vi.fn(),list:vi.fn(),retrieve:vi.fn(),checkout:vi.fn(),session:vi.fn(),expire:vi.fn(),sessions:vi.fn(),portal:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:m.user}));
vi.mock("@/services/subscriptions/backend",()=>({withBillingLease:m.lease,updateBillingOperation:m.operation,findBillingUser:m.find,wasEventProcessed:m.processed,applySubscription:m.apply}));
vi.mock("@/lib/stripe/server",()=>({getStripe:()=>({customers:{create:m.customer},subscriptions:{list:m.list,retrieve:m.retrieve},checkout:{sessions:{create:m.checkout,retrieve:m.session,list:m.sessions,expire:m.expire}},billingPortal:{sessions:{create:m.portal}},webhooks:new Stripe("sk_test_fixture").webhooks}),stripeEnvironment:(name:string)=>{const value=process.env[name];if(!value)throw Error("missing");return value;}}));
import { startCheckout,startPortal } from "@/services/subscriptions/checkout";
import { processBillingEvent,subscriptionState } from "@/services/subscriptions/webhook";
import { POST } from "@/app/api/stripe/webhook/route";
import { upgradeAccount } from "@/app/(app)/account/actions";
const user="11111111-1111-4111-8111-111111111111";
let customer:string|null;
const operation={lease_token:"lease",customer_key:"customer-key",customer_started_at:null as string|null,checkout_key:null as string|null,checkout_expires_at:null as number|null,checkout_price_id:null as string|null,checkout_origin:null as string|null,checkout_session_id:null as string|null};
// Deliberately partial API fixture: only fields consumed by this integration.
const subscription=(status="active",price="price_monthly")=>({id:"sub_current",customer:"cus_own",created:1720000000,status,metadata:{user_id:user},cancel_at_period_end:false,items:{has_more:false,data:[{quantity:1,current_period_end:4102444800,price:{id:price,recurring:{interval:"month",interval_count:1}}}]}} as unknown as Stripe.Subscription);
const event=(type="customer.subscription.updated",object:unknown=subscription())=>({id:"evt_test",type,created:1720000000,data:{object}} as Stripe.Event);
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("APP_URL","https://servicebok.example");vi.stubEnv("STRIPE_PREMIUM_MONTHLY_PRICE_ID","price_monthly");vi.stubEnv("STRIPE_PREMIUM_YEARLY_PRICE_ID","price_yearly");vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_fixture");
  customer="cus_own";Object.assign(operation,{customer_started_at:null,checkout_key:null,checkout_session_id:null,checkout_expires_at:null,checkout_price_id:null,checkout_origin:null});
  m.user.mockResolvedValue({id:user});m.lease.mockImplementation((_user,work)=>work({...operation},customer));
  m.operation.mockImplementation((_user,_lease,action,value)=>{if(action==="customer_start")operation.customer_started_at ??= new Date().toISOString();if(action==="checkout")Object.assign(operation,{checkout_key:"attempt-key",checkout_price_id:value.price,checkout_origin:value.origin,checkout_expires_at:Math.floor(Date.now()/1000)+3600});return {...operation};});
  m.list.mockResolvedValue({data:[],has_more:false});m.customer.mockResolvedValue({id:"cus_own"});m.checkout.mockResolvedValue({id:"cs_test",customer:"cus_own",status:"open",url:"https://checkout.stripe.com/c/pay/test"});m.portal.mockResolvedValue({url:"https://billing.stripe.com/p/session/test"});
  m.expire.mockResolvedValue({id:"cs_old",customer:"cus_own",status:"expired"});
  m.processed.mockResolvedValue(false);m.find.mockResolvedValue(user);m.retrieve.mockResolvedValue(subscription());
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it("unauthenticated checkout does not reach privileged backend or Stripe",async()=>{m.user.mockRejectedValue(Error("login"));await expect(startCheckout("monthly")).rejects.toThrow("login");expect(m.lease).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();});
it("Free checkout reuses own customer, fixed monthly price and APP_URL",async()=>{
  expect(await startCheckout("monthly")).toContain("checkout.stripe.com");
  expect(m.customer).not.toHaveBeenCalled();expect(m.operation).not.toHaveBeenCalledWith(user,"lease","customer_start",expect.anything());expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({mode:"subscription",customer:"cus_own",line_items:[{price:"price_monthly",quantity:1}],success_url:"https://servicebok.example/account?checkout=success",cancel_url:"https://servicebok.example/account?checkout=cancelled"}),{idempotencyKey:"servicebok-checkout:attempt-key"});
});
it("creates customer with stable idempotency and saves the relation before checkout",async()=>{customer=null;await startCheckout("monthly");expect(m.customer).toHaveBeenCalledWith({metadata:{user_id:user}},{idempotencyKey:"servicebok-customer:customer-key"});expect(m.operation.mock.calls[0]).toEqual([user,"lease","customer_start",{}]);expect(m.operation.mock.calls[1]).toEqual([user,"lease","customer",{id:"cus_own"}]);expect(operation.customer_started_at).not.toBeNull();expect(m.operation.mock.invocationCallOrder[0]).toBeLessThan(m.customer.mock.invocationCallOrder[0]);});
it("ambiguous customer attempt older than key retention fails closed",async()=>{customer=null;operation.customer_started_at="2020-01-01";await expect(startCheckout("monthly")).rejects.toThrow("reconciliation");expect(m.customer).not.toHaveBeenCalled();});
it("failed Portal without Customer does not age the first Checkout attempt after 24 hours",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));customer=null;
  await expect(startPortal()).rejects.toThrow("No billing customer");
  expect(operation.customer_started_at).toBeNull();expect(m.operation).not.toHaveBeenCalled();
  vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
  await startCheckout("monthly");expect(m.customer).toHaveBeenCalledOnce();expect(operation.customer_started_at).toBe("2026-09-22T10:00:00.000Z");
});
it("retry after an ambiguous creation failure within 23 hours reuses the same key and start time",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));customer=null;
  m.customer.mockRejectedValueOnce(Error("response lost"));
  await expect(startCheckout("monthly")).rejects.toThrow("response lost");
  const started=operation.customer_started_at;
  vi.setSystemTime(new Date("2026-09-22T08:00:00Z"));await startCheckout("monthly");
  expect(m.customer).toHaveBeenCalledTimes(2);expect(m.customer.mock.calls[1]).toEqual(m.customer.mock.calls[0]);
  expect(operation.customer_key).toBe("customer-key");expect(operation.customer_started_at).toBe(started);
});
it("failed customer_start persistence prevents any Stripe Customer creation",async()=>{
  customer=null;m.operation.mockRejectedValueOnce(Error("database unavailable"));
  await expect(startCheckout("monthly")).rejects.toThrow("database unavailable");expect(m.customer).not.toHaveBeenCalled();
});
it.each(["active","trialing","past_due","incomplete","unpaid","paused"])("existing %s subscription opens portal without another checkout",async status=>{m.list.mockResolvedValue({data:[subscription(status)],has_more:false});expect(await startCheckout("monthly")).toContain("billing.stripe.com");expect(m.checkout).not.toHaveBeenCalled();});
it("two sequential clicks reuse the same open hosted session",async()=>{operation.checkout_session_id="cs_old";operation.checkout_price_id="price_monthly";m.session.mockResolvedValue({id:"cs_old",customer:"cus_own",status:"open",url:"https://checkout.stripe.com/c/pay/old"});expect(await startCheckout("monthly")).toContain("/old");expect(m.checkout).not.toHaveBeenCalled();});
it("completed checkout awaiting subscription stays pending without granting or creating anything",async()=>{operation.checkout_session_id="cs_old";m.session.mockResolvedValue({customer:"cus_own",status:"complete"});expect(await startCheckout("monthly")).toBe("https://servicebok.example/account?checkout=success");expect(m.checkout).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();});
it("a canceled subscription can upgrade again after an earlier completed checkout",async()=>{operation.checkout_session_id="cs_old";m.session.mockResolvedValue({customer:"cus_own",status:"complete"});m.list.mockResolvedValue({data:[subscription("canceled")],has_more:false});await startCheckout("monthly");expect(m.checkout).toHaveBeenCalledOnce();});
it("lost session response retries identical saved parameters and key",async()=>{Object.assign(operation,{checkout_key:"old-key",checkout_expires_at:Math.floor(Date.now()/1000)+1000,checkout_price_id:"price_monthly",checkout_origin:"https://servicebok.example"});await startCheckout("monthly");expect(m.operation).not.toHaveBeenCalledWith(user,"lease","checkout",expect.anything());expect(m.checkout.mock.calls[0][1]).toEqual({idempotencyKey:"servicebok-checkout:old-key"});});
it("portal uses only own customer and fixed return URL",async()=>{await startPortal();expect(m.portal).toHaveBeenCalledExactlyOnceWith({customer:"cus_own",return_url:"https://servicebok.example/account"});});
it("portal without customer fails without a Stripe call",async()=>{customer=null;await expect(startPortal()).rejects.toThrow("No billing customer");expect(m.portal).not.toHaveBeenCalled();});
it("client supplied customer, price and return URL are ignored and errors remain generic",async()=>{
  m.checkout.mockRejectedValue(Error("sk_secret raw Stripe failure"));
  const form=new FormData();form.set("plan","monthly");form.set("price","attacker_price");form.set("customer","cus_victim");form.set("return_url","https://evil.example");
  const invoke=upgradeAccount as unknown as (state:unknown,form:FormData)=>Promise<{message:string}>;
  expect(await invoke({},form)).toEqual({message:"Betalningen kunde inte startas. Försök igen."});
  expect(m.checkout.mock.calls[0][0]).toMatchObject({customer:"cus_own",line_items:[{price:"price_monthly",quantity:1}]});
});
it.each(["active","trialing","past_due","canceled","unpaid","incomplete","incomplete_expired","paused"])("webhook preserves explicitly mapped %s status",async status=>{m.retrieve.mockResolvedValue(subscription(status));await processBillingEvent(event());expect(m.apply.mock.calls[0][3]).toMatchObject({status,price_matches:true});});
it("unknown price does not qualify for Premium",()=>{expect(subscriptionState(subscription("active","price_other"),user,"cus_own").price_matches).toBe(false);});
it("monthly price with yearly interval and multi-item subscriptions fail closed",()=>{const yearly=subscription();yearly.items.data[0].price.recurring!.interval="year";expect(subscriptionState(yearly,user,"cus_own").price_matches).toBe(false);const multiple=subscription();multiple.items.data.push(multiple.items.data[0]);expect(subscriptionState(multiple,user,"cus_own").price_matches).toBe(false);});
it("unknown status fails closed",()=>{expect(subscriptionState(subscription("future_status"),user,"cus_own").status).toBe("inactive");});
it("wrong customer or metadata cannot confer entitlement",async()=>{m.retrieve.mockResolvedValue({...subscription(),customer:"cus_victim"});await expect(processBillingEvent(event())).rejects.toThrow("Customer mismatch");expect(m.apply).not.toHaveBeenCalled();expect(()=>subscriptionState({...subscription(),metadata:{user_id:"victim"}},user,"cus_own")).toThrow();});
it("unmapped Stripe customer is ignored without provisioning an account",async()=>{m.find.mockResolvedValue(null);await processBillingEvent(event());expect(m.lease).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();});
it("duplicate notification skips subscription synchronization",async()=>{m.processed.mockResolvedValue(true);await processBillingEvent(event());expect(m.retrieve).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();});
it("old active payload synchronizes current canceled Stripe state after lease acquisition",async()=>{m.retrieve.mockResolvedValue(subscription("canceled"));await processBillingEvent(event());expect(m.apply.mock.calls[0][3].status).toBe("canceled");expect(m.lease.mock.invocationCallOrder[0]).toBeLessThan(m.retrieve.mock.invocationCallOrder[0]);});
it.each(["checkout.session.completed","invoice.paid","invoice.payment_failed"])("%s retrieves authoritative subscription rather than activating on payment event",async type=>{const object=type.startsWith("checkout")?{customer:"cus_own",subscription:"sub_current"}:{customer:"cus_own",parent:{subscription_details:{subscription:"sub_current"}}};await processBillingEvent(event(type,object));expect(m.retrieve).toHaveBeenCalledWith("sub_current");expect(m.apply).toHaveBeenCalledOnce();});
it("valid raw-body signature is accepted; altered payload and missing signatures fail",async()=>{
  const payload=JSON.stringify(event()),webhooks=new Stripe("sk_test_fixture").webhooks;
  const signature=webhooks.generateTestHeaderString({payload,secret:"whsec_fixture"});
  const send=(body:string,header:string)=>POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",body,headers:{"stripe-signature":header}}));
  expect((await send(payload,signature)).status).toBe(200);m.apply.mockClear();
  expect((await send(payload+" ",signature)).status).toBe(400);expect((await send(payload,"")).status).toBe(400);expect(m.apply).not.toHaveBeenCalled();
});
it("transient processing failure requests Stripe retry without leaking details",async()=>{m.retrieve.mockRejectedValue(Error("private"));const payload=JSON.stringify(event()),signature=new Stripe("sk_test_fixture").webhooks.generateTestHeaderString({payload,secret:"whsec_fixture"});const response=await POST(new Request("http://localhost/api/stripe/webhook",{method:"POST",body:payload,headers:{"stripe-signature":signature}}));expect(response.status).toBe(500);expect(await response.text()).not.toContain("private");});

it("yearly Checkout uses only the configured yearly price",async()=>{
  await startCheckout("yearly");
  expect(m.operation).toHaveBeenCalledWith(user,"lease","checkout",{price:"price_yearly",origin:"https://servicebok.example"});
  expect(m.checkout.mock.calls[0][0].line_items).toEqual([{price:"price_yearly",quantity:1}]);
});
it.each([undefined,null,"price_injected","MONTHLY","weekly",{plan:"yearly"}])("rejects invalid plan %j before lease or Stripe",async plan=>{
  await expect(startCheckout(plan)).rejects.toThrow("Invalid billing plan");
  expect(m.lease).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();
});
it("yearly server action ignores injected Price ID and return URL",async()=>{
  m.checkout.mockRejectedValue(Error("private"));
  const form=new FormData();form.set("plan","yearly");form.set("price","price_injected");form.set("return_url","https://evil.example");
  await upgradeAccount({message:""},form);
  expect(m.checkout.mock.calls[0][0]).toMatchObject({line_items:[{price:"price_yearly",quantity:1}],success_url:"https://servicebok.example/account?checkout=success"});
});
it("server action rejects a Price ID masquerading as plan",async()=>{
  const form=new FormData();form.set("plan","price_injected");
  expect(await upgradeAccount({message:""},form)).toEqual({message:"Betalningen kunde inte startas. Försök igen."});
  expect(m.lease).not.toHaveBeenCalled();
});
it.each([
  ["price_monthly","month",1,true], ["price_yearly","year",1,true],
  ["price_other","year",1,false], ["price_other","month",1,false],
  ["price_monthly","year",1,false], ["price_yearly","month",1,false],
  ["price_monthly","month",2,false], ["price_yearly","year",2,false],
] as const)("validates price %s interval %s count %i → %s",(price,interval,count,expected)=>{
  const value=subscription("active",price);value.items.data[0].price.recurring!.interval=interval;value.items.data[0].price.recurring!.interval_count=count;
  expect(subscriptionState(value,user,"cus_own").price_matches).toBe(expected);
});
it.each(["active","trialing","past_due"])("yearly webhook retains authoritative %s status and period",async status=>{
  const value=subscription(status,"price_yearly");value.items.data[0].price.recurring!.interval="year";m.retrieve.mockResolvedValue(value);
  await processBillingEvent(event());expect(m.apply.mock.calls[0][3]).toMatchObject({status,price_matches:true,period_end:"2100-01-01T00:00:00.000Z"});
  expect(m.lease.mock.invocationCallOrder[0]).toBeLessThan(m.retrieve.mock.invocationCallOrder[0]);
});
function pendingMonthly() {
  Object.assign(operation,{checkout_key:"old-key",checkout_expires_at:Math.floor(Date.now()/1000)+1000,checkout_price_id:"price_monthly",checkout_origin:"https://servicebok.example",checkout_session_id:"cs_old"});
  m.session.mockResolvedValue({id:"cs_old",customer:"cus_own",status:"open",url:"https://checkout.stripe.com/c/pay/old"});
}
it("switching plans expires old session before allocating new operation and price",async()=>{
  pendingMonthly();await startCheckout("yearly");
  expect(m.expire).toHaveBeenCalledWith("cs_old");
  expect(m.expire.mock.invocationCallOrder[0]).toBeLessThan(m.operation.mock.invocationCallOrder[0]);
  expect(m.checkout.mock.calls[0][0].line_items).toEqual([{price:"price_yearly",quantity:1}]);
  expect(m.checkout.mock.calls[0][1]).toEqual({idempotencyKey:"servicebok-checkout:attempt-key"});
});
it("failed expiration never starts a competing checkout",async()=>{
  pendingMonthly();m.expire.mockRejectedValue(Error("payment race or unavailable"));
  await expect(startCheckout("yearly")).rejects.toThrow();expect(m.operation).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();
});
it("lost Checkout response recovers original parameters before changing plan",async()=>{
  pendingMonthly();operation.checkout_session_id=null;
  await startCheckout("yearly");
  expect(m.checkout.mock.calls[0][0].line_items).toEqual([{price:"price_monthly",quantity:1}]);
  expect(m.checkout.mock.calls[0][1]).toEqual({idempotencyKey:"servicebok-checkout:old-key"});
  expect(m.expire).toHaveBeenCalledWith("cs_test");
  expect(m.checkout.mock.calls[1][0].line_items).toEqual([{price:"price_yearly",quantity:1}]);
  expect(m.checkout.mock.calls[1][1]).toEqual({idempotencyKey:"servicebok-checkout:attempt-key"});
});
it("completed old Checkout does not start a new plan while awaiting webhook",async()=>{
  pendingMonthly();m.session.mockResolvedValue({id:"cs_old",customer:"cus_own",status:"complete"});
  expect(await startCheckout("yearly")).toContain("checkout=success");
  expect(m.expire).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();
});

it.each([
  {name:"explicit Stripe flag",flag:true,status:"active",ended:null,cancel:null,expected:true},
  {name:"active cancel_at equals period end",flag:false,status:"active",ended:null,cancel:4102444800,expected:true},
  {name:"trialing cancel_at equals period end",flag:false,status:"trialing",ended:null,cancel:4102444800,expected:true},
  {name:"cancel_at one second after period",flag:false,status:"active",ended:null,cancel:4102444801,expected:false},
  {name:"cancel_at one second before period",flag:false,status:"active",ended:null,cancel:4102444799,expected:false},
  {name:"canceled subscription",flag:false,status:"canceled",ended:null,cancel:4102444800,expected:false},
  {name:"ended subscription",flag:false,status:"active",ended:4102444700,cancel:4102444800,expected:false},
  {name:"past due subscription",flag:false,status:"past_due",ended:null,cancel:4102444800,expected:false},
  {name:"missing cancel_at",flag:false,status:"active",ended:null,cancel:undefined,expected:false},
  {name:"null cancel_at",flag:false,status:"active",ended:null,cancel:null,expected:false},
  {name:"explicit flag remains authoritative when ended",flag:true,status:"canceled",ended:4102444700,cancel:null,expected:true},
])("normalizes cancellation: $name",({flag,status,ended,cancel,expected})=>{
  const value={...subscription(status),cancel_at_period_end:flag,ended_at:ended,cancel_at:cancel} as Stripe.Subscription;
  const state=subscriptionState(value,user,"cus_own");
  expect(state.cancel_at_period_end).toBe(expected);
  expect(state.period_end).toBe("2100-01-01T00:00:00.000Z");
});
it("does not infer cancellation without a numeric item period end",()=>{
  const value={...subscription(),ended_at:null,cancel_at:4102444800};value.items.data=[];
  expect(subscriptionState(value,user,"cus_own")).toMatchObject({cancel_at_period_end:false,period_end:null,price_matches:false});
});
it("does not infer cancellation from non-finite matching timestamps",()=>{
  const value={...subscription(),ended_at:null,cancel_at:NaN};value.items.data[0].current_period_end=NaN;
  expect(subscriptionState(value,user,"cus_own").cancel_at_period_end).toBe(false);
});
it.each(["price_monthly","price_yearly"])("syncs scheduled cancellation for %s after lease and skips duplicate resend",async price=>{
  const current={...subscription("active",price),ended_at:null,cancel_at:4102444800};
  current.items.data[0].price.recurring!.interval=price==="price_yearly"?"year":"month";
  m.retrieve.mockResolvedValue(current);m.processed.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const notification=event();await processBillingEvent(notification);await processBillingEvent(notification);
  expect(m.apply).toHaveBeenCalledOnce();expect(m.retrieve).toHaveBeenCalledOnce();
  expect(m.apply.mock.calls[0][3]).toMatchObject({cancel_at_period_end:true,price_matches:true,status:"active",period_end:"2100-01-01T00:00:00.000Z"});
  expect(m.lease.mock.invocationCallOrder[0]).toBeLessThan(m.retrieve.mock.invocationCallOrder[0]);
});
it("retry after failed persistence reapplies the same normalized cancellation",async()=>{
  m.retrieve.mockResolvedValue({...subscription(),ended_at:null,cancel_at:4102444800});
  m.apply.mockRejectedValueOnce(Error("temporary failure")).mockResolvedValueOnce(undefined);
  const notification=event();await expect(processBillingEvent(notification)).rejects.toThrow("temporary failure");
  await processBillingEvent(notification);
  expect(m.apply).toHaveBeenCalledTimes(2);expect(m.apply.mock.calls[1][3]).toEqual(m.apply.mock.calls[0][3]);
  expect(m.apply.mock.calls[1][3].cancel_at_period_end).toBe(true);
});
it("an older cancellation notification uses current Stripe state when cancellation was undone",async()=>{
  m.retrieve.mockResolvedValue({...subscription(),ended_at:null,cancel_at:null});
  await processBillingEvent(event("customer.subscription.updated",{...subscription(),ended_at:null,cancel_at:4102444800}));
  expect(m.apply.mock.calls[0][3].cancel_at_period_end).toBe(false);
});

const limiter = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limit", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/rate-limit")>(), enforceRateLimit: limiter }));
import { RateLimitExceededError } from "@/lib/rate-limit";

it.each(["deny", "database failure"])("Checkout and Portal stop before any lease/provider work on limiter %s", async failure => {
  limiter.mockRejectedValue(failure === "deny" ? new RateLimitExceededError(600) : new Error("private key"));
  await expect(startCheckout("monthly")).rejects.toThrow(); await expect(startPortal()).rejects.toThrow();
  expect(limiter.mock.calls).toEqual([["billing_checkout"], ["billing_portal"]]);
  for (const fn of [m.lease, m.operation, m.customer, m.checkout, m.list, m.portal]) expect(fn).not.toHaveBeenCalled();
});
it("reusing an open Checkout still consumes one user attempt", async () => {
  operation.checkout_session_id = "cs_old"; operation.checkout_price_id = "price_monthly";
  m.session.mockResolvedValue({ customer: "cus_own", status: "open", url: "https://checkout.stripe.com/c/pay/old" });
  await startCheckout("monthly"); expect(limiter).toHaveBeenCalledExactlyOnceWith("billing_checkout");
});
it("billing action shows a safe Swedish rate limit message", async () => {
  limiter.mockRejectedValue(new RateLimitExceededError(600));
  const form = new FormData(); form.set("plan", "monthly");
  expect(await upgradeAccount({ message: "" }, form)).toEqual({ message: "För många försök. Vänta en stund och försök igen." });
});
it("webhook never consumes the user limiter even if it is unavailable", async () => {
  limiter.mockRejectedValue(new Error("unavailable")); await processBillingEvent(event());
  expect(limiter).not.toHaveBeenCalled(); expect(m.apply).toHaveBeenCalled();
});
