begin;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  uploaded_by_user_id uuid not null references public.profiles(id) on delete restrict,
  file_name text not null check (char_length(file_name) between 1 and 180 and file_name !~ '[[:cntrl:]/\\]'),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 15728640),
  document_type text not null check (document_type in ('receipt','invoice','service_report','inspection_report','photo','other')),
  visibility_scope text not null default 'private' check (visibility_scope in ('private','transferable','shared')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  upload_status text not null default 'pending' check (upload_status in ('pending','ready')),
  storage_deleted_at timestamptz,
  check (storage_path = vehicle_id::text || '/' || id::text || '/original')
);
create index documents_vehicle on public.documents(vehicle_id, created_at desc);
create index documents_uploader on public.documents(uploaded_by_user_id);
create table public.service_event_documents (
  service_event_id uuid not null references public.service_events(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (service_event_id, document_id)
);
create index service_event_documents_document on public.service_event_documents(document_id);

-- Also protects privileged inserts from accidentally linking different vehicles.
create function public.check_document_event_vehicle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.documents d join public.service_events e on e.vehicle_id = d.vehicle_id
    where d.id = new.document_id and e.id = new.service_event_id and d.deleted_at is null and e.deleted_at is null) then
    raise exception 'Invalid document link' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_document_event_vehicle() from public, anon, authenticated;
create trigger document_event_vehicle before insert or update on public.service_event_documents
for each row execute function public.check_document_event_vehicle();

alter table public.documents enable row level security;
alter table public.service_event_documents enable row level security;
revoke all on public.documents, public.service_event_documents from public, anon, authenticated;
grant select on public.documents, public.service_event_documents to authenticated;
create policy documents_select_active_owner on public.documents for select to authenticated
using (deleted_at is null and upload_status = 'ready' and exists (
  select 1 from public.vehicle_ownerships o where o.vehicle_id = documents.vehicle_id
    and o.user_id = (select auth.uid()) and o.status = 'active' and o.role = 'owner' and o.ended_at is null));
create policy service_event_documents_select_active_owner on public.service_event_documents for select to authenticated
using (exists (select 1 from public.documents d where d.id = document_id)
  and exists (select 1 from public.service_events e where e.id = service_event_id));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle_documents', 'vehicle_documents', false, 15728640, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- SECURITY DEFINER avoids recursion and allows deletion authorization after metadata is hidden.
-- Only returns a boolean, and always checks the requesting user's active ownership.
create function public.document_object_access(p_path text, p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.documents d join public.vehicle_ownerships o on o.vehicle_id = d.vehicle_id
    where d.storage_path = p_path and o.user_id = auth.uid() and o.status = 'active' and o.role = 'owner' and o.ended_at is null
    and case p_action
      when 'read' then d.upload_status = 'ready' and d.deleted_at is null
      when 'upload' then d.upload_status = 'pending' and d.deleted_at is null and d.uploaded_by_user_id = auth.uid()
        and d.created_at > now() - interval '15 minutes'
      when 'delete' then d.deleted_at is not null
      else false end);
$$;
revoke all on function public.document_object_access(text,text) from public, anon, authenticated;
grant execute on function public.document_object_access(text,text) to authenticated;

create policy vehicle_documents_insert on storage.objects for insert to authenticated
with check (bucket_id = 'vehicle_documents' and public.document_object_access(name, 'upload'));
create policy vehicle_documents_read on storage.objects for select to authenticated
using (bucket_id = 'vehicle_documents' and public.document_object_access(name, 'read'));
-- Storage remove requires SELECT as well as DELETE. Restrict the extra SELECT to
-- delete operations so hidden files cannot get new download/sign URLs.
create policy vehicle_documents_delete_select on storage.objects for select to authenticated
using (bucket_id = 'vehicle_documents' and storage.allow_any_operation(array['object.delete','object.delete_many'])
  and public.document_object_access(name, 'delete'));
create policy vehicle_documents_delete on storage.objects for delete to authenticated
using (bucket_id = 'vehicle_documents' and public.document_object_access(name, 'delete'));
-- No UPDATE/upsert policy: uploaded objects cannot be overwritten.
-- Fences also protect this bucket if another feature has broad permissive policies.
create policy vehicle_documents_read_fence on storage.objects as restrictive for select to authenticated
using (bucket_id <> 'vehicle_documents' or public.document_object_access(name, 'read')
  or (storage.allow_any_operation(array['object.delete','object.delete_many']) and public.document_object_access(name, 'delete')));
create policy vehicle_documents_insert_fence on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'vehicle_documents' or public.document_object_access(name, 'upload'));
create policy vehicle_documents_delete_fence on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'vehicle_documents' or public.document_object_access(name, 'delete'));
create policy vehicle_documents_no_update on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'vehicle_documents') with check (bucket_id <> 'vehicle_documents');
create policy vehicle_documents_no_anon on storage.objects as restrictive for all to anon
using (bucket_id <> 'vehicle_documents') with check (bucket_id <> 'vehicle_documents');

create function public.create_document(p_vehicle_id uuid, p_file_name text, p_mime_type text,
  p_file_size_bytes bigint, p_document_type text, p_event_id uuid default null)
returns table (id uuid, storage_path text) language plpgsql security definer set search_path = '' as $$
declare document_id uuid := gen_random_uuid(); object_path text;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  if p_event_id is not null and not exists (select 1 from public.service_events e
    where e.id = p_event_id and e.vehicle_id = p_vehicle_id and e.deleted_at is null) then
    raise exception 'Event unavailable' using errcode = '42501';
  end if;
  object_path := p_vehicle_id::text || '/' || document_id::text || '/original';
  insert into public.documents(id, vehicle_id, uploaded_by_user_id, file_name, storage_path, mime_type, file_size_bytes, document_type)
  values (document_id, p_vehicle_id, auth.uid(), btrim(p_file_name), object_path, p_mime_type, p_file_size_bytes, p_document_type);
  if p_event_id is not null then
    insert into public.service_event_documents(service_event_id, document_id) values (p_event_id, document_id);
  end if;
  return query select document_id, object_path;
end;
$$;

create function public.finalize_document(p_vehicle_id uuid, p_document_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.documents; object_metadata jsonb;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  select * into d from public.documents where id = p_document_id and vehicle_id = p_vehicle_id
    and uploaded_by_user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Document unavailable' using errcode = '42501'; end if;
  if d.upload_status = 'ready' then return d.id; end if;
  if d.created_at <= now() - interval '3 hours' then raise exception 'Upload expired'; end if;
  if exists (select 1 from public.service_event_documents l join public.service_events e on e.id = l.service_event_id
    where l.document_id = d.id and e.deleted_at is not null) then raise exception 'Event unavailable'; end if;
  select metadata into object_metadata from storage.objects where bucket_id = 'vehicle_documents' and name = d.storage_path;
  if object_metadata is null or (object_metadata->>'size')::bigint is distinct from d.file_size_bytes
    or object_metadata->>'mimetype' is distinct from d.mime_type then raise exception 'Upload metadata mismatch'; end if;
  update public.documents set upload_status = 'ready' where id = d.id;
  return d.id;
end;
$$;

create function public.soft_delete_document(p_vehicle_id uuid, p_document_id uuid, p_pending_only boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare object_path text;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents set deleted_at = coalesce(deleted_at, now())
  where id = p_document_id and vehicle_id = p_vehicle_id and (not p_pending_only or upload_status = 'pending')
  returning storage_path into object_path;
  return object_path;
end;
$$;

-- Retry cleanup after upload capabilities have expired (2h validity + issuance window).
create function public.document_cleanup_candidates(p_vehicle_id uuid)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents d set deleted_at = coalesce(d.deleted_at, now())
  where d.vehicle_id = p_vehicle_id and d.upload_status = 'pending' and d.created_at < now() - interval '3 hours';
  return query select d.id, d.storage_path from public.documents d where d.vehicle_id = p_vehicle_id
    and d.deleted_at is not null and d.storage_deleted_at is null and d.created_at < now() - interval '3 hours'
    order by d.created_at limit 20;
end;
$$;
create function public.complete_document_cleanup(p_vehicle_id uuid, p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents d set storage_deleted_at = now() where d.id = p_document_id and d.vehicle_id = p_vehicle_id
    and d.deleted_at is not null and d.created_at < now() - interval '3 hours'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'vehicle_documents' and o.name = d.storage_path);
end;
$$;

revoke all on function public.create_document(uuid,text,text,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.finalize_document(uuid,uuid) from public,anon,authenticated;
revoke all on function public.soft_delete_document(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.document_cleanup_candidates(uuid) from public,anon,authenticated;
revoke all on function public.complete_document_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_document(uuid,text,text,bigint,text,uuid) to authenticated;
grant execute on function public.finalize_document(uuid,uuid) to authenticated;
grant execute on function public.soft_delete_document(uuid,uuid,boolean) to authenticated;
grant execute on function public.document_cleanup_candidates(uuid) to authenticated;
grant execute on function public.complete_document_cleanup(uuid,uuid) to authenticated;
commit;
