begin;

-- Add dashboard profile fields to provisioned dashboard users.
-- PostgreSQL cannot safely reorder existing columns, so this migration uses
-- additive ALTER TABLE changes and preserves existing portal_users rows.

alter table public.portal_users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text;

comment on column public.portal_users.first_name is
  'Optional dashboard display first name. Managed in portal_users after initial Auth metadata backfill.';
comment on column public.portal_users.last_name is
  'Optional dashboard display last name. Managed in portal_users after initial Auth metadata backfill.';
comment on column public.portal_users.email is
  'Normalized dashboard email copied from auth.users.email and kept synchronized by trigger.';

do $$
begin
  if exists (
    select 1
    from public.portal_users as pu
    left join auth.users as u
      on u.id = pu.user_id
    where u.id is null
  ) then
    raise exception 'portal_users contains user_id values without matching auth.users rows.';
  end if;

  if exists (
    select 1
    from public.portal_users as pu
    join auth.users as u
      on u.id = pu.user_id
    where u.email is null
      or length(btrim(u.email)) = 0
  ) then
    raise exception 'portal_users contains users without auth.users.email values.';
  end if;

  if exists (
    select 1
    from public.portal_users as pu
    join auth.users as u
      on u.id = pu.user_id
    group by lower(btrim(u.email))
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized auth.users.email values found for portal_users.';
  end if;
end;
$$;

update public.portal_users as pu
set
  first_name = coalesce(
    nullif(btrim(pu.first_name), ''),
    nullif(btrim(coalesce(
      u.raw_user_meta_data ->> 'first_name',
      u.raw_user_meta_data ->> 'given_name'
    )), '')
  ),
  last_name = coalesce(
    nullif(btrim(pu.last_name), ''),
    nullif(btrim(coalesce(
      u.raw_user_meta_data ->> 'last_name',
      u.raw_user_meta_data ->> 'family_name'
    )), '')
  ),
  email = lower(btrim(u.email))
from auth.users as u
where u.id = pu.user_id;

alter table public.portal_users
  alter column email set not null;

create unique index if not exists portal_users_email_lower_unique_idx
  on public.portal_users (lower(email));

create or replace function private.sync_portal_user_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text;
begin
  if new.email is not distinct from old.email then
    return new;
  end if;

  if exists (
    select 1
    from public.portal_users as pu
    where pu.user_id = new.id
  ) then
    if new.email is null or length(btrim(new.email)) = 0 then
      raise exception 'auth.users.email cannot be blank for a linked portal_users row.' using errcode = '23502';
    end if;

    v_email := lower(btrim(new.email));

    update public.portal_users as pu
    set email = v_email
    where pu.user_id = new.id
      and pu.email is distinct from v_email;
  end if;

  return new;
end;
$$;

comment on function private.sync_portal_user_email_from_auth() is
  'Trigger-only helper that keeps portal_users.email synchronized with auth.users.email. Display names remain managed in portal_users.';

revoke all on function private.sync_portal_user_email_from_auth() from public;
revoke all on function private.sync_portal_user_email_from_auth() from anon;
revoke all on function private.sync_portal_user_email_from_auth() from authenticated;

drop trigger if exists sync_portal_users_email_on_auth_update on auth.users;

create trigger sync_portal_users_email_on_auth_update
after update of email on auth.users
for each row
execute function private.sync_portal_user_email_from_auth();

commit;
