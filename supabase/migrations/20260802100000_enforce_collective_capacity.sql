begin;

create or replace function private.collective_registered_people(
  p_collective_id text,
  p_excluded_attendee_ids uuid[] default array[]::uuid[]
)
returns integer
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(sum(a.adult_count + a.child_count), 0)::integer
  from public.fall_2026_collective_attendees as a
  where a.collective_id = p_collective_id
    and not (a.id = any(coalesce(p_excluded_attendee_ids, array[]::uuid[])));
$$;

revoke all on function private.collective_registered_people(text, uuid[]) from public, anon, authenticated;

create or replace function private.prevent_collective_max_size_below_registered()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_registered_people integer;
begin
  if new.max_size is distinct from old.max_size then
    v_registered_people := private.collective_registered_people(new.id);
    if new.max_size < v_registered_people then
      raise exception 'Max Size cannot be lower than the % people currently registered.', v_registered_people using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_collective_max_size_below_registered() from public, anon, authenticated;

drop trigger if exists prevent_collective_max_size_below_registered on public.collectives;
create trigger prevent_collective_max_size_below_registered
before update of max_size on public.collectives
for each row
execute function private.prevent_collective_max_size_below_registered();

drop function if exists public.get_public_collectives();
create function public.get_public_collectives()
returns table (
  id text,
  city text,
  cross_streets text,
  audience text,
  childcare_option text,
  max_size integer,
  registered_people integer,
  remaining_spaces integer,
  is_full boolean,
  primary_host_last_name text,
  latitude double precision,
  longitude double precision,
  is_closed boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    c.id,
    c.city,
    c.cross_streets,
    c.audience,
    c.childcare_option,
    c.max_size,
    coalesce(attendee_totals.registered_people, 0)::integer as registered_people,
    greatest(c.max_size - coalesce(attendee_totals.registered_people, 0), 0)::integer as remaining_spaces,
    coalesce(attendee_totals.registered_people, 0) >= c.max_size as is_full,
    coalesce(nullif(pu.last_name, ''), nullif(ph.pending_last_name, ''), 'Host') as primary_host_last_name,
    c.latitude,
    c.longitude,
    c.is_closed
  from public.collectives as c
  join public.collective_hosts as ph
    on ph.collective_id = c.id
    and ph.is_primary = true
  left join public.portal_users as pu
    on pu.user_id = ph.user_id
  left join lateral (
    select sum(a.adult_count + a.child_count)::integer as registered_people
    from public.fall_2026_collective_attendees as a
    where a.collective_id = c.id
  ) as attendee_totals on true
  where private.collectives_enabled()
    and c.approval_status = 'approved'
    and c.listing_status = 'active'
    and c.latitude is not null
    and c.longitude is not null
  order by c.city, coalesce(nullif(pu.last_name, ''), nullif(ph.pending_last_name, ''), 'Host'), c.id;
$$;

drop function if exists public.get_my_collectives();
create function public.get_my_collectives()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  approval_status text,
  listing_status text,
  is_closed boolean,
  attendee_count integer,
  registered_people integer,
  remaining_spaces integer,
  is_full boolean,
  max_size integer,
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_option text,
  primary_host_phone text,
  latitude double precision,
  longitude double precision,
  primary_host_last_name text,
  my_host_id uuid,
  my_host_user_id uuid,
  my_host_is_primary boolean,
  my_host_first_name text,
  my_host_last_name text,
  my_host_email text,
  my_host_phone text
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
      c.id,
      c.created_at,
      c.updated_at,
      c.submitted_at,
      c.approved_at,
      c.approved_by,
      c.approval_status,
      c.listing_status,
      c.is_closed,
      coalesce(attendee_totals.attendee_count, 0)::integer as attendee_count,
      coalesce(attendee_totals.registered_people, 0)::integer as registered_people,
      greatest(c.max_size - coalesce(attendee_totals.registered_people, 0), 0)::integer as remaining_spaces,
      coalesce(attendee_totals.registered_people, 0) >= c.max_size as is_full,
      c.max_size,
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_option,
      case when ch_self.is_primary then ch_self.phone else null end as primary_host_phone,
      c.latitude,
      c.longitude,
      coalesce(nullif(pu_primary.last_name, ''), nullif(ph.pending_last_name, ''), 'Host') as primary_host_last_name,
      ch_self.id as my_host_id,
      ch_self.user_id as my_host_user_id,
      ch_self.is_primary as my_host_is_primary,
      coalesce(pu_self.first_name, ch_self.pending_first_name) as my_host_first_name,
      coalesce(pu_self.last_name, ch_self.pending_last_name) as my_host_last_name,
      coalesce(pu_self.email, ch_self.pending_email) as my_host_email,
      ch_self.phone as my_host_phone
    from public.collectives as c
    join public.collective_hosts as ch_self
      on ch_self.collective_id = c.id
      and ch_self.user_id = v_user_id
    join public.collective_hosts as ph
      on ph.collective_id = c.id
      and ph.is_primary = true
    left join public.portal_users as pu_primary
      on pu_primary.user_id = ph.user_id
    left join public.portal_users as pu_self
      on pu_self.user_id = ch_self.user_id
    left join lateral (
      select
        count(*)::integer as attendee_count,
        sum(a.adult_count + a.child_count)::integer as registered_people
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_totals on true
    order by c.approval_status, c.listing_status, c.city, c.id;
end;
$$;

drop function if exists public.get_admin_collectives();
create function public.get_admin_collectives()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  approval_status text,
  listing_status text,
  is_closed boolean,
  attendee_count integer,
  registered_people integer,
  remaining_spaces integer,
  is_full boolean,
  max_size integer,
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_option text,
  primary_host_phone text,
  latitude double precision,
  longitude double precision,
  primary_host_id uuid,
  primary_host_user_id uuid,
  primary_host_is_primary boolean,
  primary_host_email text,
  primary_host_first_name text,
  primary_host_last_name text,
  secondary_host_id uuid,
  secondary_host_user_id uuid,
  secondary_host_is_primary boolean,
  secondary_host_email text,
  secondary_host_first_name text,
  secondary_host_last_name text,
  secondary_host_phone text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_portal_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
    select
      c.id,
      c.created_at,
      c.updated_at,
      c.submitted_at,
      c.approved_at,
      c.approved_by,
      c.approval_status,
      c.listing_status,
      c.is_closed,
      coalesce(attendee_totals.attendee_count, 0)::integer as attendee_count,
      coalesce(attendee_totals.registered_people, 0)::integer as registered_people,
      greatest(c.max_size - coalesce(attendee_totals.registered_people, 0), 0)::integer as remaining_spaces,
      coalesce(attendee_totals.registered_people, 0) >= c.max_size as is_full,
      c.max_size,
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_option,
      coalesce(ph.phone, c.primary_host_phone) as primary_host_phone,
      c.latitude,
      c.longitude,
      ph.id as primary_host_id,
      ph.user_id as primary_host_user_id,
      ph.is_primary as primary_host_is_primary,
      coalesce(pu.email, ph.pending_email) as primary_host_email,
      coalesce(pu.first_name, ph.pending_first_name) as primary_host_first_name,
      coalesce(pu.last_name, ph.pending_last_name) as primary_host_last_name,
      sh.id as secondary_host_id,
      sh.user_id as secondary_host_user_id,
      sh.is_primary as secondary_host_is_primary,
      coalesce(su.email, sh.pending_email) as secondary_host_email,
      coalesce(su.first_name, sh.pending_first_name) as secondary_host_first_name,
      coalesce(su.last_name, sh.pending_last_name) as secondary_host_last_name,
      sh.phone as secondary_host_phone
    from public.collectives as c
    join public.collective_hosts as ph
      on ph.collective_id = c.id
      and ph.is_primary = true
    left join public.portal_users as pu
      on pu.user_id = ph.user_id
    left join public.collective_hosts as sh
      on sh.collective_id = c.id
      and sh.is_primary = false
    left join public.portal_users as su
      on su.user_id = sh.user_id
    left join lateral (
      select
        count(*)::integer as attendee_count,
        sum(a.adult_count + a.child_count)::integer as registered_people
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_totals on true
    order by c.approval_status, c.listing_status, c.city, coalesce(pu.last_name, ph.pending_last_name, ph.pending_email), c.id;
end;
$$;

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
  v_collective public.collectives%rowtype;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_normalized_phone text;
  v_email text;
  v_normalized_email text;
  v_adult_count integer;
  v_child_count integer;
  v_old_party_size integer;
  v_new_party_size integer;
  v_registered_without_attendee integer;
  v_unknown_key text;
begin
  select a.*
  into v_existing
  from public.fall_2026_collective_attendees as a
  where a.id = p_attendee_id;

  if not found then
    raise exception 'Attendee not found.' using errcode = '02000';
  end if;

  if not private.user_can_manage_collective(v_existing.collective_id) then
    raise exception 'Collective attendee access denied.' using errcode = '42501';
  end if;

  select c.*
  into v_collective
  from public.collectives as c
  where c.id = v_existing.collective_id
  for update;

  if not found then
    raise exception 'Collective not found.' using errcode = '02000';
  end if;

  select a.*
  into v_existing
  from public.fall_2026_collective_attendees as a
  where a.id = p_attendee_id
  for update;

  if not found then
    raise exception 'Attendee not found.' using errcode = '02000';
  end if;

  if v_existing.collective_id <> v_collective.id then
    select c.*
    into v_collective
    from public.collectives as c
    where c.id = v_existing.collective_id
    for update;

    if not found then
      raise exception 'Collective not found.' using errcode = '02000';
    end if;
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
  v_old_party_size := v_existing.adult_count + v_existing.child_count;
  v_new_party_size := v_adult_count + v_child_count;

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

  if v_new_party_size > v_old_party_size then
    v_registered_without_attendee := private.collective_registered_people(v_existing.collective_id, array[p_attendee_id]);
    if v_registered_without_attendee + v_new_party_size > v_collective.max_size then
      raise exception 'This change would exceed the Collective’s maximum size.' using errcode = '23514';
    end if;
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

drop function if exists public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean);
create function public.complete_fall_2026_collective_signup(
  p_collective_id text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_adult_count integer,
  p_child_count integer,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_collective public.collectives%rowtype;
  v_first_name text := btrim(coalesce(p_first_name, ''));
  v_last_name text := btrim(coalesce(p_last_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_normalized_phone text := private.normalize_collective_attendee_phone(p_phone);
  v_normalized_email text := private.normalize_collective_attendee_email(p_email);
  v_conflict_ids uuid[] := array[]::uuid[];
  v_conflict_collective_ids text[] := array[]::text[];
  v_excluded_target_ids uuid[] := array[]::uuid[];
  v_existing_same_count integer := 0;
  v_party_size integer;
  v_registered_people integer;
  v_attendee_id uuid;
begin
  if length(v_first_name) = 0 or length(v_last_name) = 0 then
    raise exception 'First and last name are required.' using errcode = '23502';
  end if;
  if v_normalized_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email is invalid.' using errcode = '23514';
  end if;
  if v_normalized_phone !~ '^[0-9]{10,15}$' then
    raise exception 'Phone number is invalid.' using errcode = '23514';
  end if;
  if p_adult_count not between 1 and 10 or p_child_count not between 0 and 10 then
    raise exception 'Household counts are invalid.' using errcode = '23514';
  end if;

  v_party_size := p_adult_count + p_child_count;

  select *
  into v_collective
  from public.collectives
  where id = p_collective_id
  for update;

  if not found then
    raise exception 'Collective not found.' using errcode = '02000';
  end if;

  if not private.collectives_enabled()
    or v_collective.approval_status <> 'approved'
    or v_collective.listing_status <> 'active' then
    raise exception 'This Collective is not currently accepting signups.' using errcode = '42501';
  end if;

  if v_collective.is_closed then
    raise exception 'We’re sorry, this group is currently closed due to capacity.' using errcode = '42501';
  end if;

  with locked as (
    select id, collective_id
    from public.fall_2026_collective_attendees
    where normalized_email = v_normalized_email
       or normalized_phone = v_normalized_phone
    for update
  )
  select
    coalesce(array_agg(id), array[]::uuid[]),
    coalesce(array_agg(distinct collective_id), array[]::text[]),
    coalesce(array_agg(id) filter (where collective_id = p_collective_id), array[]::uuid[]),
    count(*) filter (where collective_id = p_collective_id)
  into v_conflict_ids, v_conflict_collective_ids, v_excluded_target_ids, v_existing_same_count
  from locked;

  if cardinality(v_conflict_collective_ids) = 1 and v_conflict_collective_ids[1] = p_collective_id then
    return jsonb_build_object(
      'status', 'same_collective',
      'collective_id', p_collective_id,
      'prior_collective_ids', '[]'::jsonb
    );
  end if;

  v_registered_people := private.collective_registered_people(p_collective_id, v_excluded_target_ids);

  if v_registered_people >= v_collective.max_size then
    raise exception 'We’re sorry, this Collective is currently full.' using errcode = '42501';
  end if;

  if v_registered_people + v_party_size > v_collective.max_size then
    raise exception 'We’re sorry, this Collective does not have enough remaining space for your group.' using errcode = '42501';
  end if;

  if cardinality(v_conflict_ids) = 0 then
    insert into public.fall_2026_collective_attendees (
      collective_id,
      first_name,
      last_name,
      phone,
      normalized_phone,
      email,
      normalized_email,
      adult_count,
      child_count
    )
    values (
      p_collective_id,
      v_first_name,
      v_last_name,
      v_phone,
      v_normalized_phone,
      v_email,
      v_normalized_email,
      p_adult_count,
      p_child_count
    )
    returning id into v_attendee_id;

    return jsonb_build_object(
      'status', 'created',
      'attendee_id', v_attendee_id,
      'collective_id', p_collective_id,
      'prior_collective_ids', '[]'::jsonb
    );
  end if;

  if not p_confirmed then
    return jsonb_build_object(
      'status', 'conflict',
      'conflict_kind',
      case when cardinality(v_conflict_ids) > 1 then 'multiple' else 'single' end
    );
  end if;

  if cardinality(v_conflict_ids) = 1 then
    update public.fall_2026_collective_attendees as a
    set
      collective_id = p_collective_id,
      first_name = v_first_name,
      last_name = v_last_name,
      phone = v_phone,
      normalized_phone = v_normalized_phone,
      email = v_email,
      normalized_email = v_normalized_email,
      adult_count = p_adult_count,
      child_count = p_child_count
    where a.id = v_conflict_ids[1]
    returning a.id into v_attendee_id;

    return jsonb_build_object(
      'status', 'moved',
      'attendee_id', v_attendee_id,
      'collective_id', p_collective_id,
      'prior_collective_ids', to_jsonb(v_conflict_collective_ids)
    );
  end if;

  delete from public.fall_2026_collective_attendees
  where id = any(v_conflict_ids);

  insert into public.fall_2026_collective_attendees (
    collective_id,
    first_name,
    last_name,
    phone,
    normalized_phone,
    email,
    normalized_email,
    adult_count,
    child_count
  )
  values (
    p_collective_id,
    v_first_name,
    v_last_name,
    v_phone,
    v_normalized_phone,
    v_email,
    v_normalized_email,
    p_adult_count,
    p_child_count
  )
  returning id into v_attendee_id;

  return jsonb_build_object(
    'status', 'merged',
    'attendee_id', v_attendee_id,
    'collective_id', p_collective_id,
    'prior_collective_ids', to_jsonb(v_conflict_collective_ids)
  );
end;
$$;

comment on function public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean) is
  'Service-role only atomic signup/reassignment helper. Locks the target Collective row and enforces max_size against registered people.';

revoke all on function public.get_public_collectives() from public;
grant execute on function public.get_public_collectives() to anon, authenticated;
revoke all on function public.get_my_collectives() from public, anon;
grant execute on function public.get_my_collectives() to authenticated;
revoke all on function public.get_admin_collectives() from public, anon;
grant execute on function public.get_admin_collectives() to authenticated;
revoke all on function public.update_collective_attendee(uuid, jsonb) from public, anon;
grant execute on function public.update_collective_attendee(uuid, jsonb) to authenticated;
revoke all on function public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean) to service_role;

commit;
