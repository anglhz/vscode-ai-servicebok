begin;

create function public.delete_empty_vehicle(p_vehicle_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ownership_id uuid;
begin
  -- Same lock order as history/document/interval/transfer RPCs: vehicle first,
  -- then ownership. Waiters recheck ownership after deletion commits.
  perform public.lock_service_vehicle(p_vehicle_id);
  perform 1 from public.vehicle_ownerships where vehicle_id = p_vehicle_id for update;
  select id into strict ownership_id from public.vehicle_ownerships
    where vehicle_id = p_vehicle_id and user_id = auth.uid()
      and status = 'active' and role = 'owner' and ended_at is null;

  -- Do not filter out hidden, inactive, expired or cancelled history.
  -- Initial mileage is history too. RESTRICT FKs additionally fence inserts
  -- and make any unhandled dependency fail atomically rather than lose data.
  if (select count(*) from public.vehicle_ownerships where vehicle_id = p_vehicle_id) <> 1
    or exists (select 1 from public.service_events where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.mileage_entries where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.documents where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.service_intervals where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.reminders where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.vehicle_transfers where vehicle_id = p_vehicle_id)
    or exists (select 1 from public.vehicles where id = p_vehicle_id and current_mileage is not null)
    or exists (select 1 from storage.objects where bucket_id = 'vehicle_documents'
      and name like p_vehicle_id::text || '/%')
  then
    raise exception 'Vehicle has history' using errcode = 'P2001';
  end if;

  -- Lookup/provenance fields are technical identification metadata on vehicles,
  -- not independent history. Only this empty vehicle and its sole ownership go.
  -- Export is read-only; document link tables cannot exist without their parents.
  delete from public.vehicle_ownerships where id = ownership_id;
  delete from public.vehicles where id = p_vehicle_id;
end;
$$;
revoke all on function public.delete_empty_vehicle(uuid) from public, anon, authenticated;
grant execute on function public.delete_empty_vehicle(uuid) to authenticated;
comment on function public.delete_empty_vehicle(uuid) is
  'Only the sole original active owner may delete a history-free misregistered vehicle. Vehicle history and transfers block deletion, including hidden records.';

commit;
