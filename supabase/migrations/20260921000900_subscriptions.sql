begin;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium')),
  status text not null default 'inactive' check (status in ('inactive','active','trialing','past_due','canceled','unpaid','incomplete','incomplete_expired','paused')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  stripe_subscription_created_at timestamptz,
  stripe_event_created_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public,anon,authenticated;
grant select on public.subscriptions to authenticated,service_role;
create policy subscriptions_own on public.subscriptions for select to authenticated using (user_id=(select auth.uid()));

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
-- The lease serializes Stripe reads + writes across Vercel instances. Its token
-- fences late workers after expiry. No client can read or mutate this state.
create table public.billing_operations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lease_token uuid,
  lease_expires_at timestamptz,
  customer_key uuid not null default gen_random_uuid(),
  customer_started_at timestamptz,
  checkout_key uuid,
  checkout_created_at timestamptz,
  checkout_expires_at bigint,
  checkout_price_id text,
  checkout_origin text,
  checkout_session_id text
);
alter table public.stripe_webhook_events enable row level security;
alter table public.billing_operations enable row level security;
revoke all on public.stripe_webhook_events,public.billing_operations from public,anon,authenticated;
grant select on public.stripe_webhook_events to service_role;

create function public.billing_acquire(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.billing_operations; subscription public.subscriptions;
begin
  insert into public.subscriptions(user_id) values(p_user_id) on conflict(user_id) do nothing;
  insert into public.billing_operations(user_id) values(p_user_id) on conflict(user_id) do nothing;
  select * into operation from public.billing_operations where user_id=p_user_id for update;
  if operation.lease_expires_at>clock_timestamp() then raise exception 'Billing busy' using errcode='55P03'; end if;
  update public.billing_operations set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '2 minutes'
    where user_id=p_user_id returning * into operation;
  select * into subscription from public.subscriptions where user_id=p_user_id;
  return jsonb_build_object('operation',to_jsonb(operation),'subscription',to_jsonb(subscription));
end;
$$;

create function public.billing_operation(p_user_id uuid,p_lease uuid,p_action text,p_value jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare operation public.billing_operations;
begin
  select * into operation from public.billing_operations where user_id=p_user_id for update;
  if not found or operation.lease_token is distinct from p_lease or operation.lease_expires_at<=clock_timestamp() then
    raise exception 'Billing lease expired' using errcode='55P03';
  end if;
  if p_action='customer_start' then
    -- A lease alone is not a Customer attempt. Preserve the recovery key/time
    -- across retries, and never start an attempt for an already mapped Customer.
    update public.billing_operations set customer_started_at=coalesce(customer_started_at,clock_timestamp())
      where user_id=p_user_id and exists(select 1 from public.subscriptions
        where user_id=p_user_id and stripe_customer_id is null);
  elsif p_action='customer' then
    update public.subscriptions set stripe_customer_id=p_value->>'id' where user_id=p_user_id
      and (stripe_customer_id is null or stripe_customer_id=p_value->>'id');
    if not found then raise exception 'Customer mismatch'; end if;
  elsif p_action='checkout' then
    update public.billing_operations set checkout_key=gen_random_uuid(),checkout_created_at=clock_timestamp(),
      checkout_expires_at=extract(epoch from clock_timestamp())::bigint+3600,
      checkout_price_id=p_value->>'price',checkout_origin=p_value->>'origin',checkout_session_id=null where user_id=p_user_id;
  elsif p_action='session' then
    update public.billing_operations set checkout_session_id=p_value->>'id' where user_id=p_user_id;
  elsif p_action='release' then
    update public.billing_operations set lease_token=null,lease_expires_at=null where user_id=p_user_id;
  else raise exception 'Invalid billing operation'; end if;
  select * into operation from public.billing_operations where user_id=p_user_id;
  return to_jsonb(operation);
end;
$$;

create function public.apply_stripe_subscription(p_user_id uuid,p_lease uuid,p_event_id text,p_event_type text,p_event_created_at timestamptz,p_state jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare operation public.billing_operations; subscription public.subscriptions;
begin
  select * into operation from public.billing_operations where user_id=p_user_id for update;
  if not found or operation.lease_token is distinct from p_lease or operation.lease_expires_at<=clock_timestamp() then
    raise exception 'Billing lease expired' using errcode='55P03';
  end if;
  if exists(select 1 from public.stripe_webhook_events where stripe_event_id=p_event_id) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:'||p_user_id::text,0));
  select * into subscription from public.subscriptions where user_id=p_user_id for update;
  if subscription.stripe_customer_id is null or subscription.stripe_customer_id is distinct from p_state->>'customer' then
    raise exception 'Customer mismatch' using errcode='23514';
  end if;
  -- A notification for a retired subscription must not displace a replacement.
  if subscription.stripe_subscription_id is not null and subscription.stripe_subscription_id<>p_state->>'id'
    and subscription.stripe_subscription_created_at>=(p_state->>'created_at')::timestamptz then
    insert into public.stripe_webhook_events(stripe_event_id,event_type) values(p_event_id,p_event_type);
    return false;
  end if;
  update public.subscriptions set stripe_subscription_id=p_state->>'id',stripe_price_id=p_state->>'price',
    stripe_subscription_created_at=(p_state->>'created_at')::timestamptz,
    stripe_event_created_at=greatest(stripe_event_created_at,p_event_created_at),
    status=p_state->>'status',current_period_end=(p_state->>'period_end')::timestamptz,
    cancel_at_period_end=(p_state->>'cancel_at_period_end')::boolean,
    plan=case when (p_state->>'price_matches')::boolean and p_state->>'status' in ('active','trialing') then 'premium' else 'free' end
    where user_id=p_user_id;
  insert into public.stripe_webhook_events(stripe_event_id,event_type) values(p_event_id,p_event_type);
  return true;
end;
$$;
revoke all on function public.billing_acquire(uuid),public.billing_operation(uuid,uuid,text,jsonb),
  public.apply_stripe_subscription(uuid,uuid,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.billing_acquire(uuid),public.billing_operation(uuid,uuid,text,jsonb),
  public.apply_stripe_subscription(uuid,uuid,text,text,timestamptz,jsonb) to service_role;

create function public.is_premium_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.subscriptions where user_id=p_user_id and plan='premium'
    and status in ('active','trialing') and current_period_end>now());
$$;
create function public.plan_limits(p_premium boolean) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('vehicles',case when p_premium then null else 1 end,
    'document_bytes',case when p_premium then 1073741824 else 52428800 end);
$$;
revoke all on function public.is_premium_user(uuid),public.plan_limits(boolean) from public,anon,authenticated;

alter table public.documents add column quota_user_id uuid references public.profiles(id) on delete restrict;
update public.documents set quota_user_id=uploaded_by_user_id;
-- Existing opt-in grants charge the current recipient, not the historical uploader.
update public.documents d set quota_user_id=o.user_id from public.vehicle_ownerships o
where o.vehicle_id=d.vehicle_id and o.role='owner' and o.status='active' and o.ended_at is null
  and exists(select 1 from public.vehicle_transfer_documents td join public.vehicle_transfers t on t.id=td.transfer_id
    where td.document_id=d.id and t.status='accepted' and t.to_ownership_id=o.id);
alter table public.documents alter column quota_user_id set not null;
create index documents_quota_user on public.documents(quota_user_id) where deleted_at is null;

create function public.enforce_vehicle_plan() returns trigger
language plpgsql security definer set search_path='' as $$
declare maximum integer;
begin
  if new.status<>'active' or new.role<>'owner' or new.ended_at is not null then return new; end if;
  if tg_op='UPDATE' and old.user_id=new.user_id and old.status='active' and old.role='owner' and old.ended_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:'||new.user_id::text,0));
  maximum:=(public.plan_limits(public.is_premium_user(new.user_id))->>'vehicles')::integer;
  if maximum is not null and (select count(*) from public.vehicle_ownerships where user_id=new.user_id and status='active'
      and role='owner' and ended_at is null and id<>new.id)>=maximum then
    raise exception 'Premium required for more vehicles' using errcode='P1001';
  end if;
  return new;
end;
$$;
create trigger ownership_plan_limit before insert or update on public.vehicle_ownerships
for each row execute function public.enforce_vehicle_plan();

create function public.enforce_document_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare used bigint; maximum bigint;
begin
  if tg_op='INSERT' then new.quota_user_id:=new.uploaded_by_user_id; end if;
  if new.deleted_at is not null then return new; end if;
  if tg_op='UPDATE' and old.quota_user_id=new.quota_user_id and old.file_size_bytes=new.file_size_bytes and old.deleted_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('plan:'||new.quota_user_id::text,0));
  maximum:=(public.plan_limits(public.is_premium_user(new.quota_user_id))->>'document_bytes')::bigint;
  select coalesce(sum(file_size_bytes),0) into used from public.documents where quota_user_id=new.quota_user_id and deleted_at is null and id<>new.id;
  if used+new.file_size_bytes>maximum then raise exception 'Document quota exceeded' using errcode='P1002'; end if;
  return new;
end;
$$;
create trigger document_plan_limit before insert or update on public.documents
for each row execute function public.enforce_document_quota();

create function public.transfer_document_quota() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='accepted' and old.status<>'accepted' then
    update public.documents d set quota_user_id=new.to_user_id where d.deleted_at is null and d.upload_status='ready'
      and exists(select 1 from public.vehicle_transfer_documents td where td.transfer_id=new.id and td.document_id=d.id);
  end if;
  return new;
end;
$$;
create trigger transfer_plan_quota after update on public.vehicle_transfers
for each row execute function public.transfer_document_quota();
revoke all on function public.enforce_vehicle_plan(),public.enforce_document_quota(),public.transfer_document_quota() from public,anon,authenticated;

create function public.get_billing_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare premium boolean; subscription public.subscriptions;
begin
  if auth.uid() is null then raise exception 'Access denied' using errcode='42501'; end if;
  premium:=public.is_premium_user(auth.uid());
  select * into subscription from public.subscriptions where user_id=auth.uid();
  return jsonb_build_object('plan',case when premium then 'premium' else 'free' end,
    'status',coalesce(subscription.status,'inactive'),'current_period_end',subscription.current_period_end,
    'cancel_at_period_end',coalesce(subscription.cancel_at_period_end,false),
    'has_customer',subscription.stripe_customer_id is not null,'limits',public.plan_limits(premium),
    'vehicle_count',(select count(*) from public.vehicle_ownerships where user_id=auth.uid() and status='active' and role='owner' and ended_at is null),
    'document_bytes',(select coalesce(sum(file_size_bytes),0) from public.documents where quota_user_id=auth.uid() and deleted_at is null));
end;
$$;
revoke all on function public.get_billing_overview() from public,anon,authenticated;
grant execute on function public.get_billing_overview() to authenticated;
comment on table public.subscriptions is 'Webhook-synchronized state. Effective premium requires matching configured price, active/trialing, and unexpired period. No client mutations.';
comment on column public.documents.quota_user_id is 'Account charged for pending/ready non-deleted bytes. Explicit accepted transfer moves selected documents atomically; hidden unselected files remain charged to their existing account.';
commit;
