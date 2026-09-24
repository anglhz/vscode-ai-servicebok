begin;

-- At most six rows per registered account. No token, IP or capability is stored.
-- Expired windows are reused in place; account removal cleans up idle rows.
create table private.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('vehicle_lookup','pdf_export','billing_checkout','billing_portal','transfer_preview','transfer_accept')),
  used integer not null check (used >= 0),
  expires_at timestamptz not null,
  primary key (user_id, scope)
);
alter table private.rate_limits enable row level security;
revoke all on private.rate_limits from public, anon, authenticated, service_role;

create function public.consume_rate_limit(p_scope text, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare maximum integer; seconds integer; bucket private.rate_limits; checked_at timestamptz;
begin
  -- The only source of limit/window values. Callers cannot override them.
  case p_scope
    when 'vehicle_lookup' then maximum := 10; seconds := 60;
    when 'pdf_export' then maximum := 5; seconds := 60;
    when 'billing_checkout' then maximum := 5; seconds := 600;
    when 'billing_portal' then maximum := 10; seconds := 600;
    when 'transfer_preview' then maximum := 30; seconds := 60;
    when 'transfer_accept' then maximum := 10; seconds := 600;
    else raise exception 'Invalid rate limit scope' using errcode = '22023';
  end case;
  if p_user_id is null then raise exception 'Identity required' using errcode = '22023'; end if;
  insert into private.rate_limits(user_id,scope,used,expires_at)
    values(p_user_id,p_scope,0,clock_timestamp()) on conflict do nothing;
  select * into strict bucket from private.rate_limits
    where user_id = p_user_id and scope = p_scope for update;
  -- Sample after acquiring the row lock, not before waiting on another instance.
  checked_at := clock_timestamp();
  if bucket.expires_at <= checked_at then
    bucket.used := 0; bucket.expires_at := checked_at + make_interval(secs => seconds);
  end if;
  if bucket.used >= maximum then
    return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from bucket.expires_at-checked_at))::integer));
  end if;
  update private.rate_limits set used = bucket.used + 1, expires_at = bucket.expires_at
    where user_id = p_user_id and scope = p_scope;
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$$;
revoke all on function public.consume_rate_limit(text,uuid) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,uuid) to service_role;

-- Preview/accept must go through the authenticated application server. Otherwise
-- a client could bypass the separately committed rate limit via direct RPC.
-- Keep the existing capability, ownership, plan and row-lock implementation intact.
revoke all on function public.preview_vehicle_transfer(text), public.accept_vehicle_transfer(text)
  from public, anon, authenticated, service_role;

create function public.server_preview_vehicle_transfer(p_user_id uuid,p_token_hash text)
returns table(status text,make text,model text,registration_number text,expires_at timestamptz,document_count integer,is_sender boolean)
language plpgsql security definer set search_path = '' as $$
declare previous_subject text := current_setting('request.jwt.claim.sub',true);
begin
  if p_user_id is null then raise exception 'Access denied' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  return query select * from public.preview_vehicle_transfer(p_token_hash);
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);
end;
$$;
create function public.server_accept_vehicle_transfer(p_user_id uuid,p_token_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare previous_subject text := current_setting('request.jwt.claim.sub',true); vehicle_id uuid;
begin
  if p_user_id is null then raise exception 'Access denied' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub',p_user_id::text,true);
  vehicle_id := public.accept_vehicle_transfer(p_token_hash);
  perform set_config('request.jwt.claim.sub',coalesce(previous_subject,''),true);
  return vehicle_id;
end;
$$;
revoke all on function public.server_preview_vehicle_transfer(uuid,text), public.server_accept_vehicle_transfer(uuid,text)
  from public, anon, authenticated;
grant execute on function public.server_preview_vehicle_transfer(uuid,text), public.server_accept_vehicle_transfer(uuid,text) to service_role;

commit;
