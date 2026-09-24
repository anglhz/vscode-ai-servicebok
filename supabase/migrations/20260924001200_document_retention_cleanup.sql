begin;

-- A transaction lock alone cannot cover the external Storage request. Persist a
-- five-minute lease with a fencing token; crashed workers become retryable.
create table private.document_cleanup_claims (
  document_id uuid primary key references public.documents(id) on delete restrict,
  lease_token uuid not null,
  expires_at timestamptz not null
);
alter table private.document_cleanup_claims enable row level security;
revoke all on private.document_cleanup_claims from public, anon, authenticated, service_role;

create index documents_retention_candidates on public.documents(created_at, id)
  where storage_deleted_at is null and (deleted_at is not null or upload_status = 'pending');

create function public.claim_document_cleanup_batch(p_limit integer default 50)
returns table(id uuid, storage_path text, lease_token uuid)
language plpgsql security definer set search_path = '' as $$
declare candidate record; token uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid cleanup batch size' using errcode = '22023';
  end if;
  for candidate in
    select d.id, d.storage_path from public.documents d
    where d.storage_deleted_at is null
      and (d.deleted_at is not null or d.upload_status = 'pending')
      -- Same safety window as user cleanup: signed uploads last two hours and
      -- can be issued during the first 15 minutes. Never clean fresh deletions.
      and d.created_at < statement_timestamp() - interval '3 hours'
      and not exists (select 1 from private.document_cleanup_claims c
        where c.document_id = d.id and c.expires_at > statement_timestamp())
    order by d.created_at, d.id limit p_limit for update of d skip locked
  loop
    token := gen_random_uuid();
    insert into private.document_cleanup_claims(document_id, lease_token, expires_at)
      values(candidate.id, token, clock_timestamp() + interval '5 minutes')
      on conflict(document_id) do update set lease_token = excluded.lease_token, expires_at = excluded.expires_at
      -- Recheck under the unique-key lock, including claims committed after the
      -- SELECT snapshot. A competing fresh lease must never be overwritten.
      where private.document_cleanup_claims.expires_at <= clock_timestamp();
    if not found then continue; end if;
    update public.documents d set deleted_at = coalesce(d.deleted_at, clock_timestamp())
      where d.id = candidate.id;
    return query select candidate.id, candidate.storage_path, token;
  end loop;
end;
$$;

create function public.complete_document_retention_cleanup(p_document_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  -- Always lock document before claim, matching the claim RPC and user finalize.
  select * into doc from public.documents where id = p_document_id for update;
  if not found or doc.deleted_at is null then return false; end if;
  -- Retrying completion after a successful response was lost is harmless.
  if doc.storage_deleted_at is not null then
    delete from private.document_cleanup_claims where document_id = doc.id;
    return true;
  end if;
  if doc.created_at >= statement_timestamp() - interval '3 hours'
    or not exists (select 1 from private.document_cleanup_claims c
      where c.document_id = doc.id and c.lease_token = p_lease_token and c.expires_at > clock_timestamp())
    or exists (select 1 from storage.objects o where o.bucket_id = 'vehicle_documents' and o.name = doc.storage_path)
  then return false; end if;
  update public.documents set storage_deleted_at = clock_timestamp() where id = doc.id;
  delete from private.document_cleanup_claims where document_id = doc.id;
  return true;
end;
$$;

revoke all on function public.claim_document_cleanup_batch(integer) from public, anon, authenticated, service_role;
revoke all on function public.complete_document_retention_cleanup(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.claim_document_cleanup_batch(integer) to service_role;
grant execute on function public.complete_document_retention_cleanup(uuid,uuid) to service_role;
commit;
