begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if to_regprocedure('extensions.hmac(text,text,text)') is null then
    raise exception 'pgcrypto hmac must be available in the extensions schema';
  end if;
end $$;
-- Not exposed by PostgREST. Provision the signing secret separately, never in a migration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.vehicle_lookup_config (
  singleton boolean primary key default true check (singleton),
  signing_secret text not null check (octet_length(signing_secret) >= 32)
);
revoke all on private.vehicle_lookup_config from public, anon, authenticated;
alter table private.vehicle_lookup_config enable row level security;

create function public.verify_vehicle_lookup(p_receipt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  secret text; payload text; supplied text; expected text; result jsonb;
begin
  if auth.uid() is null or char_length(p_receipt) > 16000 then raise exception 'Invalid lookup' using errcode = '22023'; end if;
  select signing_secret into secret from private.vehicle_lookup_config where singleton;
  if secret is null then raise exception 'Lookup unavailable' using errcode = '22023'; end if;
  payload := split_part(p_receipt, '.', 1); supplied := split_part(p_receipt, '.', 2);
  if p_receipt <> payload || '.' || supplied or payload = '' or supplied = '' then raise exception 'Invalid lookup' using errcode = '22023'; end if;
  expected := rtrim(translate(encode(extensions.hmac('vehicle-lookup-v1:' || payload, secret, 'sha256'), 'base64'), '+/', '-_'), '=');
  -- Hash both fixed-size MACs before comparison so string prefix timing cannot expose the MAC.
  if sha256(convert_to(supplied, 'UTF8')) <> sha256(convert_to(expected, 'UTF8')) then raise exception 'Invalid lookup' using errcode = '22023'; end if;
  result := convert_from(decode(translate(payload, '-_', '+/') || repeat('=', (4 - length(payload) % 4) % 4), 'base64'), 'UTF8')::jsonb;
  if (result->>'user') is distinct from auth.uid()::text
    or coalesce((result->>'expires')::numeric, 0) <= extract(epoch from clock_timestamp()) * 1000
    or (result->>'expires')::numeric > extract(epoch from clock_timestamp() + interval '15 minutes') * 1000
    or result->>'fetchedAt' is null or jsonb_typeof(result->'vehicle') is distinct from 'object'
  then raise exception 'Invalid lookup' using errcode = '22023'; end if;
  return result;
end;
$$;
revoke all on function public.verify_vehicle_lookup(text) from public, anon, authenticated;

-- Guard both RPC inserts and existing authorized identifier updates. Keep legacy
-- duplicate rows unchanged; reject new collisions without revealing their owner/id.
create function public.guard_vehicle_identifiers() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.registration_number is not distinct from old.registration_number and new.vin is not distinct from old.vin then return new; end if;
  -- One transaction lock serializes identifier checks, including concurrent creates.
  perform pg_advisory_xact_lock(731902501);
  if exists (select 1 from public.vehicles v where v.id <> new.id and (
    (new.vin is not null and v.vin = new.vin) or
    (new.registration_number is not null and v.registration_number = new.registration_number)))
  then raise exception 'Vehicle already registered' using errcode = '23505'; end if;
  return new;
end;
$$;
revoke all on function public.guard_vehicle_identifiers() from public, anon, authenticated;
-- Alphabetically after vehicles_normalize, so matching uses normalized identifiers.
create trigger vehicles_validate_identifiers before insert or update of vin, registration_number on public.vehicles
for each row execute function public.guard_vehicle_identifiers();

drop function public.create_vehicle(text, text, text, text, integer, integer, text, text);
create function public.create_vehicle(
  p_vehicle_type text, p_make text, p_model text,
  p_registration_number text default null, p_model_year integer default null,
  p_current_mileage integer default null, p_vin text default null, p_fuel_type text default null,
  p_lookup_receipt text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid(); new_vehicle_id uuid;
  receipt jsonb; source jsonb;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_lookup_receipt is not null then
    receipt := public.verify_vehicle_lookup(p_lookup_receipt); source := receipt->'vehicle';
    if nullif(upper(regexp_replace(p_registration_number, '[[:space:]]', '', 'g')), '') is distinct from source->>'registration_number'
      or nullif(upper(regexp_replace(p_vin, '[[:space:]]', '', 'g')), '') is distinct from source->>'vin'
    then raise exception 'Lookup identifiers changed' using errcode = '22023'; end if;
  end if;
  insert into public.vehicles(vehicle_type, make, model, registration_number, model_year, current_mileage, vin, fuel_type,
    vehicle_year, power_kw, first_registration_date, color, external_provider, external_provider_id, external_data_fetched_at)
  values (p_vehicle_type, p_make, p_model, p_registration_number, p_model_year, p_current_mileage, p_vin, p_fuel_type,
    (source->>'vehicle_year')::integer, (source->>'power_kw')::integer, (source->>'first_registration_date')::date,
    source->>'color', source->>'external_provider', source->>'external_provider_id', (receipt->>'fetchedAt')::timestamptz)
  returning id into new_vehicle_id;
  insert into public.vehicle_ownerships(vehicle_id, user_id) values (new_vehicle_id, current_user_id);
  if p_current_mileage is not null then
    insert into public.mileage_entries(vehicle_id, recorded_by_user_id, mileage, recorded_at, source)
    values (new_vehicle_id, current_user_id, p_current_mileage, now(), 'manual');
  end if;
  return new_vehicle_id;
end;
$$;
revoke all on function public.create_vehicle(text, text, text, text, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.create_vehicle(text, text, text, text, integer, integer, text, text, text) to authenticated;
comment on table private.vehicle_lookup_config is 'Server signing secret, provision separately. Never expose through API, client privileges or logs.';
commit;
