begin;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_number text check (char_length(registration_number) between 1 and 32),
  vin text check (char_length(vin) between 1 and 64),
  make text not null check (char_length(btrim(make)) between 1 and 100 and make ~ '[^[:space:]]'),
  model text not null check (char_length(btrim(model)) between 1 and 100 and model ~ '[^[:space:]]'),
  model_year integer check (model_year between 1886 and 2100),
  vehicle_year integer check (vehicle_year between 1886 and 2100),
  fuel_type text check (char_length(fuel_type) between 1 and 50),
  power_kw integer check (power_kw >= 0),
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle', 'moped', 'motorhome', 'caravan', 'other')),
  current_mileage integer check (current_mileage >= 0),
  first_registration_date date,
  color text,
  external_provider text,
  external_provider_id text,
  external_data_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_ownerships (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role text not null default 'owner' check (role in ('owner')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended', 'pending_transfer', 'revoked')),
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (status <> 'active' or ended_at is null),
  check (status not in ('ended', 'revoked') or ended_at is not null)
);

-- Historical ownership survives; account deletion needs a separate retention flow.
create unique index vehicle_one_active_owner on public.vehicle_ownerships(vehicle_id)
where status = 'active' and role = 'owner';
create index vehicle_ownerships_user_vehicle on public.vehicle_ownerships(user_id, vehicle_id);
create index vehicle_ownerships_vehicle on public.vehicle_ownerships(vehicle_id);
create index vehicles_registration_number on public.vehicles(registration_number);
create index vehicles_vin on public.vehicles(vin);

create function public.normalize_vehicle_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.registration_number := nullif(upper(regexp_replace(new.registration_number, '[[:space:]]', '', 'g')), '');
  new.vin := nullif(upper(regexp_replace(new.vin, '[[:space:]]', '', 'g')), '');
  new.make := btrim(new.make);
  new.model := btrim(new.model);
  new.fuel_type := nullif(btrim(new.fuel_type), '');
  return new;
end;
$$;
revoke all on function public.normalize_vehicle_fields() from public, anon, authenticated;
create trigger vehicles_normalize before insert or update on public.vehicles
for each row execute function public.normalize_vehicle_fields();
create trigger vehicles_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();

alter table public.vehicles enable row level security;
alter table public.vehicle_ownerships enable row level security;
revoke all on public.vehicles, public.vehicle_ownerships from public, anon, authenticated;
grant select on public.vehicles, public.vehicle_ownerships to authenticated;
-- Identity, timestamps and provider provenance are not client-editable.
grant update (registration_number, vin, make, model, model_year, vehicle_year,
  fuel_type, power_kw, vehicle_type, current_mileage, first_registration_date, color)
on public.vehicles to authenticated;

-- No join back to vehicles: this policy cannot recurse with the vehicle policies.
create policy vehicle_ownerships_select_own on public.vehicle_ownerships
for select to authenticated using (user_id = (select auth.uid()));

create policy vehicles_select_active_owner on public.vehicles for select to authenticated
using (exists (select 1 from public.vehicle_ownerships o
  where o.vehicle_id = vehicles.id and o.user_id = (select auth.uid())
    and o.status = 'active' and o.role = 'owner' and o.ended_at is null));
create policy vehicles_update_active_owner on public.vehicles for update to authenticated
using (exists (select 1 from public.vehicle_ownerships o
  where o.vehicle_id = vehicles.id and o.user_id = (select auth.uid())
    and o.status = 'active' and o.role = 'owner' and o.ended_at is null))
with check (exists (select 1 from public.vehicle_ownerships o
  where o.vehicle_id = vehicles.id and o.user_id = (select auth.uid())
    and o.status = 'active' and o.role = 'owner' and o.ended_at is null));

-- One transaction, no client identity parameter, no exception swallowing.
create function public.create_vehicle(
  p_vehicle_type text, p_make text, p_model text,
  p_registration_number text default null, p_model_year integer default null,
  p_current_mileage integer default null, p_vin text default null, p_fuel_type text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  new_vehicle_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  insert into public.vehicles (vehicle_type, make, model, registration_number, model_year, current_mileage, vin, fuel_type)
  values (p_vehicle_type, p_make, p_model, p_registration_number, p_model_year, p_current_mileage, p_vin, p_fuel_type)
  returning id into new_vehicle_id;
  insert into public.vehicle_ownerships (vehicle_id, user_id)
  values (new_vehicle_id, current_user_id);
  return new_vehicle_id;
end;
$$;
revoke all on function public.create_vehicle(text, text, text, text, integer, integer, text, text)
from public, anon, authenticated;
grant execute on function public.create_vehicle(text, text, text, text, integer, integer, text, text) to authenticated;

comment on table public.vehicles is 'Vehicle data; access follows active ownership. Mileage is in Swedish mil; history comes in a later migration.';
comment on table public.vehicle_ownerships is 'Ownership history; clients may only read their own rows. Mutations require controlled server functions.';
commit;
