-- Read-only post-migration audit. Run as database owner in a dedicated staging
-- project. Does not expose rows, secrets, capabilities or function bodies.
begin read only;
do $$
declare item text;
begin
  foreach item in array array['profiles','vehicles','vehicle_ownerships','service_events','mileage_entries',
    'documents','service_event_documents','service_intervals','reminders','vehicle_transfers',
    'vehicle_transfer_documents','subscriptions','stripe_webhook_events','billing_operations'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=item and c.relrowsecurity and c.relkind='r') then
      raise exception 'Missing table/RLS: %',item;
    end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and not coalesce('search_path=""'=any(p.proconfig),false)) then
    raise exception 'Unsafe SECURITY DEFINER search_path';
  end if;
  foreach item in array array['service_interval_overview','reminder_overview'] loop
    if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=item and 'security_invoker=true'=any(c.reloptions)) then
      raise exception 'Missing invoker view: %',item;
    end if;
  end loop;
  if to_regprocedure('extensions.hmac(text,text,text)') is null
    or to_regprocedure('storage.allow_any_operation(text[])') is null then raise exception 'Missing Supabase/extension prerequisite'; end if;
  if not exists(select 1 from storage.buckets where id='vehicle_documents' and not public
    and file_size_limit=15728640 and allowed_mime_types @> array['application/pdf','image/jpeg','image/png']) then
    raise exception 'Private Storage bucket configuration mismatch';
  end if;
  if has_table_privilege('authenticated','public.subscriptions','INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','public.subscriptions','SELECT')
    or has_table_privilege('authenticated','public.stripe_webhook_events','SELECT')
    or has_table_privilege('authenticated','public.billing_operations','SELECT')
    or has_column_privilege('authenticated','public.vehicle_transfers','token_hash','SELECT')
    or has_function_privilege('authenticated','public.billing_acquire(uuid)','EXECUTE') then
    raise exception 'Unexpected privileged client access';
  end if;
  foreach item in array array['on_auth_user_created','ownership_plan_limit','document_plan_limit','transfer_plan_quota','vehicles_validate_identifiers','document_event_vehicle'] loop
    if not exists(select 1 from pg_trigger where tgname=item and tgenabled<>'D') then raise exception 'Missing active trigger: %',item; end if;
  end loop;
  if exists(select 1 from pg_constraint where connamespace='public'::regnamespace and not convalidated)
    or exists(select 1 from pg_index i join pg_class c on c.oid=i.indrelid where c.relnamespace='public'::regnamespace and not i.indisvalid) then
    raise exception 'Unvalidated constraint/index';
  end if;
  foreach item in array array['vehicle_one_active_owner','vehicle_one_pending_transfer','documents_quota_user'] loop
    if to_regclass('public.'||item) is null then raise exception 'Missing index: %',item; end if;
  end loop;
end $$;
select current_setting('server_version') as postgres_version,
  (select count(*) from pg_policies where schemaname in ('public','storage')) as policy_count,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosecdef) as definer_count;
commit;
