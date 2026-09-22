import { afterEach,beforeEach,expect,it,vi } from "vitest";
import Stripe from "stripe";
vi.mock("server-only",()=>({}));
const m=vi.hoisted(()=>({user:vi.fn(),lease:vi.fn(),operation:vi.fn(),find:vi.fn(),processed:vi.fn(),apply:vi.fn(),customer:vi.fn(),list:vi.fn(),retrieve:vi.fn(),checkout:vi.fn(),session:vi.fn(),sessions:vi.fn(),portal:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUser:m.user}));
vi.mock("@/services/subscriptions/backend",()=>({withBillingLease:m.lease,updateBillingOperation:m.operation,findBillingUser:m.find,wasEventProcessed:m.processed,applySubscription:m.apply}));
vi.mock("@/lib/stripe/server",()=>({getStripe:()=>({customers:{create:m.customer},subscriptions:{list:m.list,retrieve:m.retrieve},checkout:{sessions:{create:m.checkout,retrieve:m.session,list:m.sessions}},billingPortal:{sessions:{create:m.portal}},webhooks:new Stripe("sk_test_fixture").webhooks}),stripeEnvironment:(name:string)=>{const value=process.env[name];if(!value)throw Error("missing");return value;}}));
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
  vi.resetAllMocks();vi.stubEnv("APP_URL","https://servicebok.example");vi.stubEnv("STRIPE_PREMIUM_PRICE_ID","price_monthly");vi.stubEnv("STRIPE_WEBHOOK_SECRET","whsec_fixture");
  customer="cus_own";Object.assign(operation,{customer_started_at:null,checkout_key:null,checkout_session_id:null,checkout_expires_at:null,checkout_price_id:null,checkout_origin:null});
  m.user.mockResolvedValue({id:user});m.lease.mockImplementation((_user,work)=>work({...operation},customer));
  m.operation.mockImplementation((_user,_lease,action,value)=>{if(action==="customer_start")operation.customer_started_at ??= new Date().toISOString();if(action==="checkout")Object.assign(operation,{checkout_key:"attempt-key",checkout_price_id:value.price,checkout_origin:value.origin,checkout_expires_at:Math.floor(Date.now()/1000)+3600});return {...operation};});
  m.list.mockResolvedValue({data:[],has_more:false});m.customer.mockResolvedValue({id:"cus_own"});m.checkout.mockResolvedValue({id:"cs_test",status:"open",url:"https://checkout.stripe.com/c/pay/test"});m.portal.mockResolvedValue({url:"https://billing.stripe.com/p/session/test"});
  m.processed.mockResolvedValue(false);m.find.mockResolvedValue(user);m.retrieve.mockResolvedValue(subscription());
});
afterEach(()=>{vi.unstubAllEnvs();vi.useRealTimers();});
it("unauthenticated checkout does not reach privileged backend or Stripe",async()=>{m.user.mockRejectedValue(Error("login"));await expect(startCheckout()).rejects.toThrow("login");expect(m.lease).not.toHaveBeenCalled();expect(m.checkout).not.toHaveBeenCalled();});
it("Free checkout reuses own customer, fixed monthly price and APP_URL",async()=>{
  expect(await startCheckout()).toContain("checkout.stripe.com");
  expect(m.customer).not.toHaveBeenCalled();expect(m.operation).not.toHaveBeenCalledWith(user,"lease","customer_start",expect.anything());expect(m.checkout).toHaveBeenCalledWith(expect.objectContaining({mode:"subscription",customer:"cus_own",line_items:[{price:"price_monthly",quantity:1}],success_url:"https://servicebok.example/account?checkout=success",cancel_url:"https://servicebok.example/account?checkout=cancelled"}),{idempotencyKey:"servicebok-checkout:attempt-key"});
});
it("creates customer with stable idempotency and saves the relation before checkout",async()=>{customer=null;await startCheckout();expect(m.customer).toHaveBeenCalledWith({metadata:{user_id:user}},{idempotencyKey:"servicebok-customer:customer-key"});expect(m.operation.mock.calls[0]).toEqual([user,"lease","customer_start",{}]);expect(m.operation.mock.calls[1]).toEqual([user,"lease","customer",{id:"cus_own"}]);expect(operation.customer_started_at).not.toBeNull();expect(m.operation.mock.invocationCallOrder[0]).toBeLessThan(m.customer.mock.invocationCallOrder[0]);});
it("ambiguous customer attempt older than key retention fails closed",async()=>{customer=null;operation.customer_started_at="2020-01-01";await expect(startCheckout()).rejects.toThrow("reconciliation");expect(m.customer).not.toHaveBeenCalled();});
it("failed Portal without Customer does not age the first Checkout attempt after 24 hours",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));customer=null;
  await expect(startPortal()).rejects.toThrow("No billing customer");
  expect(operation.customer_started_at).toBeNull();expect(m.operation).not.toHaveBeenCalled();
  vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
  await startCheckout();expect(m.customer).toHaveBeenCalledOnce();expect(operation.customer_started_at).toBe("2026-09-22T10:00:00.000Z");
});
it("retry after an ambiguous creation failure within 23 hours reuses the same key and start time",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));customer=null;
  m.customer.mockRejectedValueOnce(Error("response lost"));
  await expect(startCheckout()).rejects.toThrow("response lost");
  const started=operation.customer_started_at;
  vi.setSystemTime(new Date("2026-09-22T08:00:00Z"));await startCheckout();
  expect(m.customer).toHaveBeenCalledTimes(2);expect(m.customer.mock.calls[1]).toEqual(m.customer.mock.calls[0]);
  expect(operation.customer_key).toBe("customer-key");expect(operation.customer_started_at).toBe(started);
});
it("failed customer_start persistence prevents any Stripe Customer creation",async()=>{
  customer=null;m.operation.mockRejectedValueOnce(Error("database unavailable"));
  await expect(startCheckout()).rejects.toThrow("database unavailable");expect(m.customer).not.toHaveBeenCalled();
});
it.each(["active","trialing","past_due","incomplete","unpaid","paused"])("existing %s subscription opens portal without another checkout",async status=>{m.list.mockResolvedValue({data:[subscription(status)],has_more:false});expect(await startCheckout()).toContain("billing.stripe.com");expect(m.checkout).not.toHaveBeenCalled();});
it("two sequential clicks reuse the same open hosted session",async()=>{operation.checkout_session_id="cs_old";m.session.mockResolvedValue({customer:"cus_own",status:"open",url:"https://checkout.stripe.com/c/pay/old"});expect(await startCheckout()).toContain("/old");expect(m.checkout).not.toHaveBeenCalled();});
it("completed checkout awaiting subscription stays pending without granting or creating anything",async()=>{operation.checkout_session_id="cs_old";m.session.mockResolvedValue({customer:"cus_own",status:"complete"});expect(await startCheckout()).toBe("https://servicebok.example/account?checkout=success");expect(m.checkout).not.toHaveBeenCalled();expect(m.apply).not.toHaveBeenCalled();});
it("a canceled subscription can upgrade again after an earlier completed checkout",async()=>{operation.checkout_session_id="cs_old";m.session.mockResolvedValue({customer:"cus_own",status:"complete"});m.list.mockResolvedValue({data:[subscription("canceled")],has_more:false});await startCheckout();expect(m.checkout).toHaveBeenCalledOnce();});
it("lost session response retries identical saved parameters and key",async()=>{Object.assign(operation,{checkout_key:"old-key",checkout_expires_at:Math.floor(Date.now()/1000)+1000,checkout_price_id:"price_monthly",checkout_origin:"https://servicebok.example"});await startCheckout();expect(m.operation).not.toHaveBeenCalledWith(user,"lease","checkout",expect.anything());expect(m.checkout.mock.calls[0][1]).toEqual({idempotencyKey:"servicebok-checkout:old-key"});});
it("portal uses only own customer and fixed return URL",async()=>{await startPortal();expect(m.portal).toHaveBeenCalledExactlyOnceWith({customer:"cus_own",return_url:"https://servicebok.example/account"});});
it("portal without customer fails without a Stripe call",async()=>{customer=null;await expect(startPortal()).rejects.toThrow("No billing customer");expect(m.portal).not.toHaveBeenCalled();});
it("client supplied customer, price and return URL are ignored and errors remain generic",async()=>{
  m.checkout.mockRejectedValue(Error("sk_secret raw Stripe failure"));
  const form=new FormData();form.set("price","attacker_price");form.set("customer","cus_victim");form.set("return_url","https://evil.example");
  const invoke=upgradeAccount as unknown as (state:unknown,form:FormData)=>Promise<{message:string}>;
  expect(await invoke({},form)).toEqual({message:"Betalningen kunde inte startas. Försök igen."});
  expect(m.checkout.mock.calls[0][0]).toMatchObject({customer:"cus_own",line_items:[{price:"price_monthly",quantity:1}]});
});
it.each(["active","trialing","past_due","canceled","unpaid","incomplete","incomplete_expired","paused"])("webhook preserves explicitly mapped %s status",async status=>{m.retrieve.mockResolvedValue(subscription(status));await processBillingEvent(event());expect(m.apply.mock.calls[0][3]).toMatchObject({status,price_matches:true});});
it("unknown price does not qualify for Premium",()=>{expect(subscriptionState(subscription("active","price_other"),user,"cus_own").price_matches).toBe(false);});
it("yearly prices and multi-item subscriptions fail closed",()=>{const yearly=subscription();yearly.items.data[0].price.recurring!.interval="year";expect(subscriptionState(yearly,user,"cus_own").price_matches).toBe(false);const multiple=subscription();multiple.items.data.push(multiple.items.data[0]);expect(subscriptionState(multiple,user,"cus_own").price_matches).toBe(false);});
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
