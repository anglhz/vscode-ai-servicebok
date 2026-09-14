begin;

create table public.service_intervals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 150 and name ~ '[^[:space:]]'),
  category text not null check (category in ('service','repair','inspection','tires','oil','brakes','timing_belt','battery','accessory','damage','mileage','other')),
  distance_interval integer check (distance_interval > 0),
  month_interval integer check (month_interval between 1 and 1200),
  last_completed_date date check (last_completed_date between date '1886-01-01' and date '2100-12-31'),
  last_completed_mileage integer check (last_completed_mileage >= 0),
  source text not null default 'owner' check (source in ('system','external_provider','owner')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (distance_interval is not null or month_interval is not null),
  check (last_completed_mileage::bigint + distance_interval::bigint <= 2147483647),
  unique (id, vehicle_id)
);
create index service_intervals_vehicle on public.service_intervals(vehicle_id, is_active);
create trigger service_intervals_updated_at before update on public.service_intervals for each row execute function public.set_updated_at();

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  service_interval_id uuid unique,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 150 and title ~ '[^[:space:]]'),
  reminder_type text not null check (reminder_type in ('service','inspection','tires','insurance','tax','custom')),
  due_date date, due_mileage integer check (due_mileage >= 0),
  status text not null default 'active' check (status in ('active','completed','dismissed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (service_interval_id, vehicle_id) references public.service_intervals(id, vehicle_id) on delete restrict,
  check (service_interval_id is not null or due_date is not null or due_mileage is not null),
  check ((status = 'completed') = (completed_at is not null))
);
create index reminders_user_status on public.reminders(user_id, status);
create index reminders_vehicle on public.reminders(vehicle_id);
create trigger reminders_updated_at before update on public.reminders for each row execute function public.set_updated_at();
alter table public.service_intervals enable row level security;
alter table public.reminders enable row level security;
revoke all on public.service_intervals, public.reminders from public, anon, authenticated;
grant select on public.service_intervals, public.reminders to authenticated;
create policy service_intervals_active_owner on public.service_intervals for select to authenticated using (
  exists (select 1 from public.vehicle_ownerships o where o.vehicle_id = service_intervals.vehicle_id
    and o.user_id = (select auth.uid()) and o.status = 'active' and o.role = 'owner' and o.ended_at is null));
create policy reminders_own_active_vehicle on public.reminders for select to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.vehicle_ownerships o where o.vehicle_id = reminders.vehicle_id
    and o.user_id = (select auth.uid()) and o.status = 'active' and o.role = 'owner' and o.ended_at is null));

-- A single calendar calculation shared by the views and reminder synchronization.
-- PostgreSQL month addition clamps to the last day of the destination month.
create function public.service_due(p_date date, p_months integer, p_mileage integer, p_distance integer)
returns table(due_date date, due_mileage integer) language sql immutable set search_path = '' as $$
  select (p_date + make_interval(months => p_months))::date, p_mileage + p_distance;
$$;
create function public.service_due_status(p_date date, p_mileage integer, p_current integer,
  p_expect_date boolean, p_expect_mileage boolean, p_distance integer, p_today date)
returns table(urgency text, remaining_days integer, remaining_mileage integer, priority integer)
language sql immutable set search_path = '' as $$
  with values_left as (select p_date - p_today as days, p_mileage - p_current as miles),
  ranked as (select days, miles, case
    when days < 0 or miles < 0 then 'overdue'
    when days between 0 and 30 or miles between 0 and coalesce(ceil(p_distance * 0.1)::integer, 500) then 'due_soon'
    when (p_expect_date and days is null) or (p_expect_mileage and miles is null)
      or (days is null and miles is null) then 'unknown'
    else 'ok' end as state from values_left)
  select state, days, miles, case state when 'overdue' then 0 when 'due_soon' then 1 when 'ok' then 2 else 3 end from ranked;
$$;
revoke all on function public.service_due(date,integer,integer,integer),
  public.service_due_status(date,integer,integer,boolean,boolean,integer,date) from public, anon, authenticated;
grant execute on function public.service_due(date,integer,integer,integer),
  public.service_due_status(date,integer,integer,boolean,boolean,integer,date) to authenticated;

create view public.service_interval_overview with (security_invoker = true) as
select i.*, d.due_date, d.due_mileage, s.urgency, s.remaining_days, s.remaining_mileage, s.priority
from public.service_intervals i join public.vehicles v on v.id = i.vehicle_id
cross join lateral public.service_due(i.last_completed_date, i.month_interval, i.last_completed_mileage, i.distance_interval) d
cross join lateral public.service_due_status(d.due_date, d.due_mileage, v.current_mileage,
  i.month_interval is not null, i.distance_interval is not null, i.distance_interval,
  (now() at time zone 'Europe/Stockholm')::date) s;
create view public.reminder_overview with (security_invoker = true) as
select r.*, v.make, v.model, v.registration_number, s.urgency, s.remaining_days, s.remaining_mileage, s.priority
from public.reminders r join public.vehicles v on v.id = r.vehicle_id
left join public.service_intervals i on i.id = r.service_interval_id and i.vehicle_id = r.vehicle_id
cross join lateral public.service_due_status(r.due_date, r.due_mileage, v.current_mileage,
  case when r.service_interval_id is null then r.due_date is not null else i.month_interval is not null end,
  case when r.service_interval_id is null then r.due_mileage is not null else i.distance_interval is not null end,
  i.distance_interval, (now() at time zone 'Europe/Stockholm')::date) s
where r.service_interval_id is null or i.is_active;
revoke all on public.service_interval_overview, public.reminder_overview from public, anon, authenticated;
grant select on public.service_interval_overview, public.reminder_overview to authenticated;

-- Private helper, used only within a vehicle/ownership-locked transaction.
create function public.sync_interval_reminder(p_interval_id uuid) returns void
language plpgsql set search_path = '' as $$
declare i public.service_intervals; d record;
begin
  select * into strict i from public.service_intervals where id = p_interval_id;
  if not i.is_active then
    update public.reminders set status = 'dismissed', completed_at = null where service_interval_id = i.id;
    return;
  end if;
  select * into d from public.service_due(i.last_completed_date, i.month_interval, i.last_completed_mileage, i.distance_interval);
  insert into public.reminders(vehicle_id,user_id,service_interval_id,title,reminder_type,due_date,due_mileage)
  values (i.vehicle_id,auth.uid(),i.id,i.name,case when i.category in ('inspection','tires') then i.category else 'service' end,d.due_date,d.due_mileage)
  on conflict (service_interval_id) do update set title = excluded.title, reminder_type = excluded.reminder_type,
    user_id = excluded.user_id, due_date = excluded.due_date, due_mileage = excluded.due_mileage, status = 'active', completed_at = null;
end;
$$;
revoke all on function public.sync_interval_reminder(uuid) from public, anon, authenticated;

create function public.save_service_interval(p_vehicle_id uuid, p_name text, p_category text,
  p_distance_interval integer default null, p_month_interval integer default null,
  p_last_completed_date date default null, p_last_completed_mileage integer default null, p_interval_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  if p_interval_id is null then
    insert into public.service_intervals(vehicle_id,name,category,distance_interval,month_interval,last_completed_date,last_completed_mileage,source)
    values (p_vehicle_id,btrim(p_name),p_category,p_distance_interval,p_month_interval,p_last_completed_date,p_last_completed_mileage,'owner') returning id into saved_id;
  else
    update public.service_intervals set name = btrim(p_name), category = p_category, distance_interval = p_distance_interval,
      month_interval = p_month_interval, last_completed_date = p_last_completed_date, last_completed_mileage = p_last_completed_mileage
    where id = p_interval_id and vehicle_id = p_vehicle_id and is_active returning id into saved_id;
    if saved_id is null then raise exception 'Interval unavailable' using errcode = '42501'; end if;
  end if;
  perform public.sync_interval_reminder(saved_id);
  return saved_id;
end;
$$;
create function public.complete_service_interval(p_vehicle_id uuid,p_interval_id uuid,p_date date,p_mileage integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  if p_date is null and p_mileage is null then raise exception 'Completion values required' using errcode = '22023'; end if;
  update public.service_intervals set last_completed_date = p_date, last_completed_mileage = p_mileage
  where id = p_interval_id and vehicle_id = p_vehicle_id and is_active;
  if not found then raise exception 'Interval unavailable' using errcode = '42501'; end if;
  perform public.sync_interval_reminder(p_interval_id);
  -- Planning baseline only. Mileage history and vehicles.current_mileage are unchanged.
end;
$$;
create function public.deactivate_service_interval(p_vehicle_id uuid,p_interval_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.service_intervals set is_active = false where id = p_interval_id and vehicle_id = p_vehicle_id;
  if not found then raise exception 'Interval unavailable' using errcode = '42501'; end if;
  perform public.sync_interval_reminder(p_interval_id);
end;
$$;
create function public.create_custom_reminder(p_vehicle_id uuid,p_title text,p_due_date date default null,p_due_mileage integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  if p_due_date is not null and p_due_date not between date '1886-01-01' and date '2100-12-31' then raise exception 'Invalid date' using errcode = '22023'; end if;
  insert into public.reminders(vehicle_id,user_id,title,reminder_type,due_date,due_mileage)
  values (p_vehicle_id,auth.uid(),btrim(p_title),'custom',p_due_date,p_due_mileage) returning id into saved_id;
  return saved_id;
end;
$$;
create function public.set_reminder_status(p_vehicle_id uuid,p_reminder_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reminders;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  select * into r from public.reminders where id = p_reminder_id and vehicle_id = p_vehicle_id and user_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'Reminder unavailable' using errcode = '42501'; end if;
  if p_status not in ('completed','dismissed') or p_status is null then raise exception 'Invalid status' using errcode = '22023'; end if;
  if p_status = 'completed' and r.service_interval_id is not null then raise exception 'Complete interval instead' using errcode = '22023'; end if;
  update public.reminders set status = p_status, completed_at = case when p_status = 'completed' then now() else null end where id = r.id;
end;
$$;
revoke all on function public.save_service_interval(uuid,text,text,integer,integer,date,integer,uuid),
  public.complete_service_interval(uuid,uuid,date,integer), public.deactivate_service_interval(uuid,uuid),
  public.create_custom_reminder(uuid,text,date,integer), public.set_reminder_status(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.save_service_interval(uuid,text,text,integer,integer,date,integer,uuid),
  public.complete_service_interval(uuid,uuid,date,integer), public.deactivate_service_interval(uuid,uuid),
  public.create_custom_reminder(uuid,text,date,integer), public.set_reminder_status(uuid,uuid,text) to authenticated;
commit;
