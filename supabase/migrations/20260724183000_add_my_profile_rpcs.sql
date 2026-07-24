begin;

create or replace function public.get_my_profile()
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  return query
    select
      pu.user_id,
      pu.first_name,
      pu.last_name,
      pu.email,
      pu.is_admin
    from public.portal_users as pu
    where pu.user_id = v_user_id;
end;
$$;

comment on function public.get_my_profile() is
  'Returns only the authenticated dashboard user profile row from portal_users.';

revoke all on function public.get_my_profile() from public;
revoke all on function public.get_my_profile() from anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.update_my_profile(
  p_changes jsonb
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  is_admin boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.portal_users%rowtype;
  v_unknown_key text;
  v_first_name text;
  v_last_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Changes must be a JSON object.' using errcode = '22023';
  end if;

  if p_changes = '{}'::jsonb then
    raise exception 'At least one profile change is required.' using errcode = '22023';
  end if;

  select key
  into v_unknown_key
  from jsonb_object_keys(p_changes) as keys(key)
  where key not in ('first_name', 'last_name')
  limit 1;

  if v_unknown_key is not null then
    if v_unknown_key = 'email' then
      raise exception 'Email changes must be requested through Supabase Auth verification.' using errcode = '42501';
    end if;
    raise exception 'Field "%" cannot be updated through personal profile settings.', v_unknown_key using errcode = '42501';
  end if;

  select pu.*
  into v_profile
  from public.portal_users as pu
  where pu.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found for authenticated user.' using errcode = '42501';
  end if;

  v_first_name := v_profile.first_name;
  v_last_name := v_profile.last_name;

  if p_changes ? 'first_name' then
    if jsonb_typeof(p_changes->'first_name') <> 'string' then
      raise exception 'first_name must be a nonblank string.' using errcode = '22023';
    end if;
    v_first_name := btrim(p_changes->>'first_name');
    if length(v_first_name) = 0 or char_length(v_first_name) > 80 then
      raise exception 'first_name must be nonblank and at most 80 characters.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'last_name' then
    if jsonb_typeof(p_changes->'last_name') <> 'string' then
      raise exception 'last_name must be a nonblank string.' using errcode = '22023';
    end if;
    v_last_name := btrim(p_changes->>'last_name');
    if length(v_last_name) = 0 or char_length(v_last_name) > 80 then
      raise exception 'last_name must be nonblank and at most 80 characters.' using errcode = '22023';
    end if;
  end if;

  if v_first_name is null or length(btrim(v_first_name)) = 0 then
    raise exception 'first_name is required.' using errcode = '22023';
  end if;

  if v_last_name is null or length(btrim(v_last_name)) = 0 then
    raise exception 'last_name is required.' using errcode = '22023';
  end if;

  return query
    update public.portal_users as pu
    set
      first_name = btrim(v_first_name),
      last_name = btrim(v_last_name)
    where pu.user_id = v_user_id
    returning
      pu.user_id,
      pu.first_name,
      pu.last_name,
      pu.email,
      pu.is_admin;
end;
$$;

comment on function public.update_my_profile(jsonb) is
  'Patch-updates the authenticated dashboard user first and last name. Email changes must go through Supabase Auth verification and the Auth-to-portal_users sync trigger.';

revoke all on function public.update_my_profile(jsonb) from public;
revoke all on function public.update_my_profile(jsonb) from anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

revoke all on table public.portal_users from public;
revoke all on table public.portal_users from anon;
revoke all on table public.portal_users from authenticated;

commit;
