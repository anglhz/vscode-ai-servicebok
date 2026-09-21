begin;

-- One statement/snapshot, no row cap and no security-definer bypass of ownership or document RLS.
-- Only export fields leave PostgreSQL; identifiers, notes, filenames and account data are excluded.
create function public.get_vehicle_export_data(p_vehicle_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'generated_at', now(),
    'vehicle', jsonb_build_object('registration_number',v.registration_number,'make',v.make,'model',v.model,
      'model_year',v.model_year,'vehicle_type',v.vehicle_type,'vin',v.vin,'current_mileage',v.current_mileage),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'event_date',e.event_date,'category',e.category,'title',e.title,'mileage',e.mileage,
      'cost_amount',e.cost_amount,'currency',e.currency,'provider_name',e.provider_name,
      'description',e.description,'source_type',e.source_type,
      'has_document',exists(select 1 from public.service_event_documents link where link.service_event_id = e.id)
    ) order by e.event_date,e.created_at,e.id) from public.service_events e
      where e.vehicle_id = v.id and e.deleted_at is null),'[]'::jsonb),
    'intervals', coalesce((select jsonb_agg(jsonb_build_object(
      'name',i.name,'due_date',i.due_date,'due_mileage',i.due_mileage,'urgency',i.urgency
    ) order by i.priority,i.due_date nulls last,i.due_mileage nulls last,i.id)
      from public.service_interval_overview i where i.vehicle_id = v.id and i.is_active),'[]'::jsonb)
  ) from public.vehicles v where v.id = p_vehicle_id;
$$;
revoke all on function public.get_vehicle_export_data(uuid) from public,anon,authenticated;
grant execute on function public.get_vehicle_export_data(uuid) to authenticated;
comment on function public.get_vehicle_export_data(uuid) is 'Read-only vehicle PDF snapshot using caller RLS. No notes, accounts, original files, paths, names or personal reminders.';
commit;
