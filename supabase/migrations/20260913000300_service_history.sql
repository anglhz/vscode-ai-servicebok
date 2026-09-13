begin;

-- Keep the baseline snapshot and creation RPC change in one consistent migration.
lock table public.vehicles, public.vehicle_ownerships in share row exclusive mode;

create table public.service_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('service', 'repair', 'inspection', 'tires', 'oil', 'brakes', 'timing_belt', 'battery', 'accessory', 'damage', 'mileage', 'other')),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 150 and title ~ '[^[:space:]]'),
  description text check (char_length(description) between 1 and 5000),
  event_date date not null check (event_date between date '1886-01-01' and date '2100-12-31'),
  mileage integer check (mileage >= 0),
  cost_amount integer check (cost_amount >= 0),
  currency text not null default 'SEK' check (currency = 'SEK'),
  provider_name text check (char_length(provider_name) between 1 and 150),
  notes text check (char_length(notes) between 1 and 5000),
  source_type text not null default 'owner' check (source_type in ('owner', 'previous_owner', 'imported', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, vehicle_id)
);
create index service_events_vehicle_timeline on public.service_events(vehicle_id, event_date desc, created_at desc) where deleted_at is null;
create trigger service_events_updated_at before update on public.service_events
for each row execute function public.set_updated_at();

create table public.mileage_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  recorded_by_user_id uuid not null references public.profiles(id) on delete restrict,
  mileage integer not null check (mileage >= 0),
  recorded_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'service_event', 'imported', 'system')),
  service_event_id uuid unique,
  created_at timestamptz not null default now(),
  foreign key (service_event_id, vehicle_id) references public.service_events(id, vehicle_id) on delete restrict,
  check ((source = 'service_event') = (service_event_id is not null))
);
create index mileage_entries_vehicle on public.mileage_entries(vehicle_id);

-- Preserve readings registered before mileage history existed, including ended ownership.
insert into public.mileage_entries(vehicle_id, recorded_by_user_id, mileage, recorded_at, source)
select v.id, (select o.user_id from public.vehicle_ownerships o where o.vehicle_id = v.id
  order by (o.status = 'active') desc, o.started_at desc, o.id limit 1),
  v.current_mileage, v.updated_at, 'manual'
from public.vehicles v where v.current_mileage is not null;

alter table public.service_events enable row level security;
alter table public.mileage_entries enable row level security;
revoke all on public.service_events, public.mileage_entries from public, anon, authenticated;
grant select on public.service_events, public.mileage_entries to authenticated;
-- current_mileage is now derived. Direct edits would silently bypass its history.
revoke update (current_mileage) on public.vehicles from authenticated;

create policy service_events_select_active_owner on public.service_events for select to authenticated
using (deleted_at is null and exists (select 1 from public.vehicle_ownerships o
  where o.vehicle_id = service_events.vehicle_id and o.user_id = (select auth.uid())
  and o.status = 'active' and o.role = 'owner' and o.ended_at is null));
create policy mileage_entries_select_active_owner on public.mileage_entries for select to authenticated
using (exists (select 1 from public.vehicle_ownerships o
  where o.vehicle_id = mileage_entries.vehicle_id and o.user_id = (select auth.uid())
  and o.status = 'active' and o.role = 'owner' and o.ended_at is null)
  and (service_event_id is null or exists (select 1 from public.service_events e
    where e.id = mileage_entries.service_event_id and e.deleted_at is null)));

-- Private helper: callers hold the vehicle lock before modifying events/readings.
-- Locking the active relation also blocks a concurrent ownership revocation.
create function public.lock_service_vehicle(p_vehicle_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Access denied' using errcode = '42501'; end if;
  perform 1 from public.vehicles where id = p_vehicle_id for update;
  perform 1 from public.vehicle_ownerships where vehicle_id = p_vehicle_id
    and user_id = auth.uid() and status = 'active' and role = 'owner' and ended_at is null for share;
  if not found then raise exception 'Access denied' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.lock_service_vehicle(uuid) from public, anon, authenticated;

-- Called only inside the locked transaction. Deleted rows remain for traceability
-- but cannot contribute to the current reading or normal history.
create function public.sync_service_mileage(p_event_id uuid)
returns void language plpgsql set search_path = '' as $$
declare e public.service_events;
begin
  select * into strict e from public.service_events where id = p_event_id;
  if e.deleted_at is null then
    if e.mileage is null then
      delete from public.mileage_entries where service_event_id = e.id;
    else
      insert into public.mileage_entries(vehicle_id, recorded_by_user_id, mileage, recorded_at, source, service_event_id)
      values (e.vehicle_id, e.created_by_user_id, e.mileage, e.event_date::timestamp at time zone 'Europe/Stockholm', 'service_event', e.id)
      on conflict (service_event_id) do update set mileage = excluded.mileage, recorded_at = excluded.recorded_at;
    end if;
  end if;
  update public.vehicles set current_mileage = (
    select max(m.mileage) from public.mileage_entries m
    left join public.service_events s on s.id = m.service_event_id
    where m.vehicle_id = e.vehicle_id and (m.service_event_id is null or s.deleted_at is null)
  ) where id = e.vehicle_id;
end;
$$;
revoke all on function public.sync_service_mileage(uuid) from public, anon, authenticated;

create function public.create_service_event(
  p_vehicle_id uuid, p_category text, p_title text, p_event_date date,
  p_mileage integer default null, p_cost_amount integer default null,
  p_description text default null, p_provider_name text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare event_id uuid;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  insert into public.service_events(vehicle_id, created_by_user_id, category, title, event_date, mileage, cost_amount, description, provider_name, notes)
  values (p_vehicle_id, auth.uid(), p_category, btrim(p_title), p_event_date, p_mileage, p_cost_amount,
    nullif(btrim(p_description), ''), nullif(btrim(p_provider_name), ''), nullif(btrim(p_notes), '')) returning id into event_id;
  perform public.sync_service_mileage(event_id);
  return event_id;
end;
$$;

create function public.update_service_event(
  p_vehicle_id uuid, p_event_id uuid, p_category text, p_title text, p_event_date date,
  p_mileage integer default null, p_cost_amount integer default null,
  p_description text default null, p_provider_name text default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.service_events set category = p_category, title = btrim(p_title), event_date = p_event_date,
    mileage = p_mileage, cost_amount = p_cost_amount, description = nullif(btrim(p_description), ''),
    provider_name = nullif(btrim(p_provider_name), ''), notes = nullif(btrim(p_notes), '')
  where id = p_event_id and vehicle_id = p_vehicle_id and deleted_at is null;
  if not found then raise exception 'Event unavailable' using errcode = '42501'; end if;
  perform public.sync_service_mileage(p_event_id);
  return p_event_id;
end;
$$;

create function public.soft_delete_service_event(p_vehicle_id uuid, p_event_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.service_events set deleted_at = now()
  where id = p_event_id and vehicle_id = p_vehicle_id and deleted_at is null;
  if not found then raise exception 'Event unavailable' using errcode = '42501'; end if;
  perform public.sync_service_mileage(p_event_id);
  return p_event_id;
end;
$$;

revoke all on function public.create_service_event(uuid, text, text, date, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.update_service_event(uuid, uuid, text, text, date, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.soft_delete_service_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_service_event(uuid, text, text, date, integer, integer, text, text, text) to authenticated;
grant execute on function public.update_service_event(uuid, uuid, text, text, date, integer, integer, text, text, text) to authenticated;
grant execute on function public.soft_delete_service_event(uuid, uuid) to authenticated;

-- Preserve the public signature/security model; add the initial reading atomically.
create or replace function public.create_vehicle(
  p_vehicle_type text, p_make text, p_model text,
  p_registration_number text default null, p_model_year integer default null,
  p_current_mileage integer default null, p_vin text default null, p_fuel_type text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  new_vehicle_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.vehicles(vehicle_type, make, model, registration_number, model_year, current_mileage, vin, fuel_type)
  values (p_vehicle_type, p_make, p_model, p_registration_number, p_model_year, p_current_mileage, p_vin, p_fuel_type)
  returning id into new_vehicle_id;
  insert into public.vehicle_ownerships(vehicle_id, user_id) values (new_vehicle_id, current_user_id);
  if p_current_mileage is not null then
    insert into public.mileage_entries(vehicle_id, recorded_by_user_id, mileage, recorded_at, source)
    values (new_vehicle_id, current_user_id, p_current_mileage, now(), 'manual');
  end if;
  return new_vehicle_id;
end;
$$;

comment on table public.mileage_entries is 'Initial/manual readings plus one synchronized row per service event. Deleted events are excluded from current mileage.';
commit;
