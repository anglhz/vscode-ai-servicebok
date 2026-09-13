begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  preferred_locale text not null default 'sv',
  timezone text not null default 'Europe/Stockholm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Private application profile; identity belongs to auth.users.';

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create function public.prevent_profile_identity_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Profile identity and creation time are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_immutable_identity before update on public.profiles
for each row execute function public.prevent_profile_identity_change();

alter table public.profiles enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, preferred_locale, timezone) on public.profiles to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- No INSERT/DELETE privilege or policy for clients. The trigger runs as its owner.
create function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.prevent_profile_identity_change() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Preserve existing Auth accounts if this migration is applied after signups.
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

commit;
