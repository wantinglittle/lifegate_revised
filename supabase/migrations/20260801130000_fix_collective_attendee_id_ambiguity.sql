begin;

create or replace function public.update_collective_attendee(
  p_attendee_id uuid,
  p_changes jsonb
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  phone text,
  email text,
  adult_count integer,
  child_count integer,
  signed_up_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_existing public.fall_2026_collective_attendees%rowtype;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_normalized_phone text;
  v_email text;
  v_normalized_email text;
  v_adult_count integer;
  v_child_count integer;
  v_unknown_key text;
begin
  select a.*
  into v_existing
  from public.fall_2026_collective_attendees as a
  where a.id = p_attendee_id
  for update;

  if not found then
    raise exception 'Attendee not found.' using errcode = '02000';
  end if;

  if not private.user_can_manage_collective(v_existing.collective_id) then
    raise exception 'Collective attendee access denied.' using errcode = '42501';
  end if;

  select key
  into v_unknown_key
  from jsonb_object_keys(coalesce(p_changes, '{}'::jsonb)) as key
  where key not in ('first_name', 'last_name', 'phone', 'email', 'adult_count', 'child_count')
  limit 1;

  if v_unknown_key is not null then
    raise exception 'Field "%" cannot be updated here.', v_unknown_key using errcode = '22023';
  end if;

  v_first_name := btrim(coalesce(p_changes ->> 'first_name', v_existing.first_name));
  v_last_name := btrim(coalesce(p_changes ->> 'last_name', v_existing.last_name));
  v_phone := btrim(coalesce(p_changes ->> 'phone', v_existing.phone));
  v_email := btrim(coalesce(p_changes ->> 'email', v_existing.email));
  v_normalized_phone := private.normalize_collective_attendee_phone(v_phone);
  v_normalized_email := private.normalize_collective_attendee_email(v_email);
  v_adult_count := coalesce(nullif(p_changes ->> 'adult_count', '')::integer, v_existing.adult_count);
  v_child_count := coalesce(nullif(p_changes ->> 'child_count', '')::integer, v_existing.child_count);

  if length(v_first_name) = 0 or length(v_last_name) = 0 then
    raise exception 'First and last name are required.' using errcode = '23502';
  end if;
  if v_normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email is invalid.' using errcode = '23514';
  end if;
  if v_normalized_phone !~ '^[0-9]{10,15}$' then
    raise exception 'Phone number is invalid.' using errcode = '23514';
  end if;
  if v_adult_count not between 1 and 10 or v_child_count not between 0 and 10 then
    raise exception 'Household counts are invalid.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.fall_2026_collective_attendees as other
    where other.id <> p_attendee_id
      and (other.normalized_email = v_normalized_email or other.normalized_phone = v_normalized_phone)
  ) then
    raise exception 'Another Fall 2026 attendee registration already uses that email or phone.' using errcode = '23505';
  end if;

  return query
    update public.fall_2026_collective_attendees as a
    set
      first_name = v_first_name,
      last_name = v_last_name,
      phone = v_phone,
      normalized_phone = v_normalized_phone,
      email = v_email,
      normalized_email = v_normalized_email,
      adult_count = v_adult_count,
      child_count = v_child_count
    where a.id = p_attendee_id
    returning
      a.id,
      a.first_name,
      a.last_name,
      a.phone,
      a.email,
      a.adult_count,
      a.child_count,
      a.signed_up_at,
      a.updated_at;
end;
$$;

create or replace function public.remove_collective_attendee(p_attendee_id uuid)
returns table (
  id uuid,
  collective_id text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_existing public.fall_2026_collective_attendees%rowtype;
begin
  select a.*
  into v_existing
  from public.fall_2026_collective_attendees as a
  where a.id = p_attendee_id
  for update;

  if not found then
    raise exception 'Attendee not found.' using errcode = '02000';
  end if;

  if not private.user_can_manage_collective(v_existing.collective_id) then
    raise exception 'Collective attendee access denied.' using errcode = '42501';
  end if;

  return query
    delete from public.fall_2026_collective_attendees as a
    where a.id = p_attendee_id
    returning a.id, a.collective_id;
end;
$$;

revoke all on function public.update_collective_attendee(uuid, jsonb) from public, anon;
grant execute on function public.update_collective_attendee(uuid, jsonb) to authenticated;
revoke all on function public.remove_collective_attendee(uuid) from public, anon;
grant execute on function public.remove_collective_attendee(uuid) to authenticated;

commit;
