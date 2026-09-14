begin;

create table public.vehicle_transfers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  from_user_id uuid not null references public.profiles(id) on delete restrict,
  to_user_id uuid references public.profiles(id) on delete restrict,
  from_ownership_id uuid not null references public.vehicle_ownerships(id) on delete restrict,
  to_ownership_id uuid references public.vehicle_ownerships(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (from_user_id is distinct from to_user_id),
  check ((status = 'accepted') = (accepted_at is not null and to_user_id is not null and to_ownership_id is not null)),
  check (status = 'accepted' or (accepted_at is null and to_user_id is null and to_ownership_id is null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index vehicle_one_pending_transfer on public.vehicle_transfers(vehicle_id) where status = 'pending';
create index vehicle_transfers_seller on public.vehicle_transfers(from_user_id,created_at desc);
create index vehicle_transfers_recipient_ownership on public.vehicle_transfers(to_ownership_id) where status = 'accepted';
create trigger vehicle_transfers_updated_at before update on public.vehicle_transfers for each row execute function public.set_updated_at();

create table public.vehicle_transfer_documents (
  transfer_id uuid not null references public.vehicle_transfers(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (transfer_id,document_id)
);
create index vehicle_transfer_documents_document on public.vehicle_transfer_documents(document_id);
create function public.check_transfer_document_vehicle() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.vehicle_transfers t join public.documents d on d.vehicle_id = t.vehicle_id
    where t.id = new.transfer_id and d.id = new.document_id) then
    raise exception 'Invalid document selection' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_transfer_document_vehicle() from public,anon,authenticated;
create trigger transfer_document_vehicle before insert or update on public.vehicle_transfer_documents
for each row execute function public.check_transfer_document_vehicle();
alter table public.vehicle_transfers enable row level security;
alter table public.vehicle_transfer_documents enable row level security;
revoke all on public.vehicle_transfers,public.vehicle_transfer_documents from public,anon,authenticated;
-- The digest is itself a capability for the RPC and is never a selectable column.
grant select(id,vehicle_id,from_user_id,to_user_id,status,expires_at,accepted_at,cancelled_at,created_at,updated_at)
  on public.vehicle_transfers to authenticated;
grant select on public.vehicle_transfer_documents to authenticated;
create policy transfers_seller on public.vehicle_transfers for select to authenticated using (from_user_id = (select auth.uid()));
create policy transfer_documents_seller on public.vehicle_transfer_documents for select to authenticated using (
  exists (select 1 from public.vehicle_transfers t where t.id = transfer_id and t.from_user_id = (select auth.uid())));

-- Grant belongs to this ownership period, not to every future owner or a returning recipient.
-- Status/lifecycle checks are separate so authorized cleanup can still remove hidden files.
create function public.document_access_granted(p_document_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.documents d join public.vehicle_ownerships o on o.vehicle_id = d.vehicle_id
    where d.id = p_document_id and o.user_id = auth.uid() and o.status = 'active' and o.role = 'owner' and o.ended_at is null
    and (d.uploaded_by_user_id = auth.uid() or exists (
      select 1 from public.vehicle_transfer_documents td join public.vehicle_transfers t on t.id = td.transfer_id
      where td.document_id = d.id and t.vehicle_id = d.vehicle_id and t.status = 'accepted' and t.to_ownership_id = o.id)));
$$;
revoke all on function public.document_access_granted(uuid) from public,anon,authenticated;
grant execute on function public.document_access_granted(uuid) to authenticated;
drop policy documents_select_active_owner on public.documents;
create policy documents_select_active_owner on public.documents for select to authenticated
using (deleted_at is null and upload_status = 'ready' and public.document_access_granted(id));
create or replace function public.document_object_access(p_path text,p_action text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.documents d where d.storage_path = p_path and public.document_access_granted(d.id)
    and case p_action
      when 'read' then d.upload_status = 'ready' and d.deleted_at is null
      when 'upload' then d.upload_status = 'pending' and d.deleted_at is null and d.uploaded_by_user_id = auth.uid()
        and d.created_at > now() - interval '15 minutes'
      when 'delete' then d.deleted_at is not null
      else false end);
$$;
create or replace function public.soft_delete_document(p_vehicle_id uuid,p_document_id uuid,p_pending_only boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare object_path text;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents set deleted_at = coalesce(deleted_at,now())
  where id = p_document_id and vehicle_id = p_vehicle_id and public.document_access_granted(id)
    and (not p_pending_only or upload_status = 'pending') returning storage_path into object_path;
  return object_path;
end;
$$;
create or replace function public.document_cleanup_candidates(p_vehicle_id uuid)
returns table(id uuid,storage_path text) language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents d set deleted_at = coalesce(d.deleted_at,now()) where d.vehicle_id = p_vehicle_id
    and public.document_access_granted(d.id) and d.upload_status = 'pending' and d.created_at < now() - interval '3 hours';
  return query select d.id,d.storage_path from public.documents d where d.vehicle_id = p_vehicle_id
    and public.document_access_granted(d.id) and d.deleted_at is not null and d.storage_deleted_at is null
    and d.created_at < now() - interval '3 hours' order by d.created_at limit 20;
end;
$$;
create or replace function public.complete_document_cleanup(p_vehicle_id uuid,p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  update public.documents d set storage_deleted_at = now() where d.id = p_document_id and d.vehicle_id = p_vehicle_id
    and public.document_access_granted(d.id) and d.deleted_at is not null and d.created_at < now() - interval '3 hours'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'vehicle_documents' and o.name = d.storage_path);
end;
$$;

create function public.create_vehicle_transfer(p_vehicle_id uuid,p_document_ids uuid[] default '{}')
returns table(id uuid,token text,expires_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare transfer_id uuid; ownership_id uuid; raw_token text; expiry timestamptz := clock_timestamp() + interval '7 days';
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  select o.id into strict ownership_id from public.vehicle_ownerships o where o.vehicle_id = p_vehicle_id
    and o.user_id = auth.uid() and o.status = 'active' and o.role = 'owner' and o.ended_at is null;
  if p_document_ids is null or cardinality(p_document_ids) > 100 then
    raise exception 'Invalid document selection' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_document_ids) selected(document_id) where not exists (
    select 1 from public.documents d where d.id = selected.document_id and d.vehicle_id = p_vehicle_id
      and d.upload_status = 'ready' and d.deleted_at is null and public.document_access_granted(d.id))) then
    raise exception 'Invalid document selection' using errcode = '42501';
  end if;
  update public.vehicle_transfers t set status = 'expired' where t.vehicle_id = p_vehicle_id
    and t.status = 'pending' and t.expires_at <= clock_timestamp();
  raw_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.vehicle_transfers(vehicle_id,from_user_id,from_ownership_id,token_hash,expires_at)
  values (p_vehicle_id,auth.uid(),ownership_id,encode(extensions.digest(raw_token,'sha256'),'hex'),expiry)
  returning vehicle_transfers.id into transfer_id;
  insert into public.vehicle_transfer_documents(transfer_id,document_id)
  select transfer_id,selected.document_id from (select distinct unnest(p_document_ids) as document_id) selected;
  return query select transfer_id,raw_token,expiry;
end;
$$;

-- Authenticated bearer preview deliberately omits ids, authors, histories and document metadata.
create function public.preview_vehicle_transfer(p_token_hash text)
returns table(status text,make text,model text,registration_number text,expires_at timestamptz,document_count integer,is_sender boolean)
language plpgsql security definer set search_path = '' as $$
declare t public.vehicle_transfers;
begin
  if auth.uid() is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select * into t from public.vehicle_transfers vt where vt.token_hash = p_token_hash;
  if not found then return; end if;
  if t.status <> 'pending' or t.expires_at <= clock_timestamp() or not exists (
    select 1 from public.vehicle_ownerships o where o.id = t.from_ownership_id and o.status = 'active' and o.ended_at is null) then
    return query select case when t.status = 'pending' then 'expired' else t.status end,
      null::text,null::text,null::text,t.expires_at,0,false;
    return;
  end if;
  return query select t.status,v.make,v.model,v.registration_number,t.expires_at,
    (select count(*)::integer from public.vehicle_transfer_documents td join public.documents d on d.id = td.document_id
      where td.transfer_id = t.id and d.deleted_at is null and d.upload_status = 'ready'),t.from_user_id = auth.uid()
    from public.vehicles v where v.id = t.vehicle_id;
end;
$$;

create function public.accept_vehicle_transfer(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.vehicle_transfers; target_vehicle_id uuid; ownership_id uuid; accepted_time timestamptz;
begin
  if auth.uid() is null then raise exception 'Access denied' using errcode = '42501'; end if;
  select vt.vehicle_id into target_vehicle_id from public.vehicle_transfers vt where vt.token_hash = p_token_hash;
  if not found then raise exception 'Transfer unavailable' using errcode = '42501'; end if;
  -- Same order as event/document/interval mutations: vehicle, ownership, then transfer.
  perform 1 from public.vehicles v where v.id = target_vehicle_id for update;
  select o.id into ownership_id from public.vehicle_ownerships o where o.vehicle_id = target_vehicle_id
    and o.status = 'active' and o.role = 'owner' and o.ended_at is null for update;
  select * into t from public.vehicle_transfers vt where vt.token_hash = p_token_hash for update;
  if t.status <> 'pending' or t.expires_at <= clock_timestamp() or t.from_user_id = auth.uid()
    or ownership_id is distinct from t.from_ownership_id then
    raise exception 'Transfer unavailable' using errcode = '42501';
  end if;
  accepted_time := clock_timestamp();
  update public.vehicle_ownerships set status = 'ended',ended_at = accepted_time where id = ownership_id;
  insert into public.vehicle_ownerships(vehicle_id,user_id,started_at) values (t.vehicle_id,auth.uid(),accepted_time)
    returning id into ownership_id;
  update public.vehicle_transfers set status = 'accepted',to_user_id = auth.uid(),to_ownership_id = ownership_id,accepted_at = accepted_time where id = t.id;
  update public.reminders r set user_id = auth.uid() where r.vehicle_id = t.vehicle_id and r.service_interval_id is not null;
  update public.reminders r set status = 'dismissed',completed_at = null
    where r.vehicle_id = t.vehicle_id and r.service_interval_id is null and r.status = 'active';
  return t.vehicle_id;
end;
$$;
create function public.cancel_vehicle_transfer(p_vehicle_id uuid,p_transfer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cancelled_time timestamptz;
begin
  perform public.lock_service_vehicle(p_vehicle_id);
  cancelled_time := clock_timestamp();
  update public.vehicle_transfers set status = case when expires_at <= cancelled_time then 'expired' else 'cancelled' end,
    cancelled_at = case when expires_at > cancelled_time then cancelled_time else null end
  where id = p_transfer_id and vehicle_id = p_vehicle_id and from_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Transfer unavailable' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.create_vehicle_transfer(uuid,uuid[]),public.preview_vehicle_transfer(text),
  public.accept_vehicle_transfer(text),public.cancel_vehicle_transfer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_vehicle_transfer(uuid,uuid[]),public.preview_vehicle_transfer(text),
  public.accept_vehicle_transfer(text),public.cancel_vehicle_transfer(uuid,uuid) to authenticated;
comment on table public.vehicle_transfers is 'Controlled transfer lifecycle audit with source/recipient ownership periods; only a SHA-256 digest is persisted.';
comment on table public.vehicle_transfer_documents is 'Explicit opt-in for one accepted recipient ownership. Never changes historical visibility_scope.';
commit;
