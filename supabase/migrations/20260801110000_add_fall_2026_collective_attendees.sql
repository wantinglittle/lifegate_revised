begin;

alter table public.collectives
  add column if not exists is_closed boolean not null default false;

comment on column public.collectives.is_closed is
  'When true, the Collective remains visible if approved/active but public Fall 2026 attendee signup is closed.';

create table if not exists public.fall_2026_collective_attendees (
  id uuid primary key default gen_random_uuid(),
  collective_id text not null references public.collectives(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  normalized_phone text not null,
  email text not null,
  normalized_email text not null,
  adult_count integer not null,
  child_count integer not null,
  signed_up_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fall_2026_collective_attendees_first_name_present check (length(btrim(first_name)) > 0),
  constraint fall_2026_collective_attendees_last_name_present check (length(btrim(last_name)) > 0),
  constraint fall_2026_collective_attendees_email_format check (
    normalized_email = lower(btrim(email))
    and normalized_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint fall_2026_collective_attendees_phone_digits check (normalized_phone ~ '^[0-9]{10,15}$'),
  constraint fall_2026_collective_attendees_adult_count_range check (adult_count between 1 and 10),
  constraint fall_2026_collective_attendees_child_count_range check (child_count between 0 and 10)
);

comment on table public.fall_2026_collective_attendees is
  'Fall 2026 Collective household attendee signup records. Attendee data is not copied into auth, portal user, host, Community, or Collective rows.';
comment on column public.fall_2026_collective_attendees.collective_id is
  'References public.collectives.id, which is text in the deployed Collectives schema.';

create unique index if not exists fall_2026_collective_attendees_email_unique_idx
  on public.fall_2026_collective_attendees (normalized_email);

create unique index if not exists fall_2026_collective_attendees_phone_unique_idx
  on public.fall_2026_collective_attendees (normalized_phone);

create index if not exists fall_2026_collective_attendees_collective_id_idx
  on public.fall_2026_collective_attendees (collective_id);

drop trigger if exists set_fall_2026_collective_attendees_updated_at
  on public.fall_2026_collective_attendees;

create trigger set_fall_2026_collective_attendees_updated_at
before update on public.fall_2026_collective_attendees
for each row
execute function public.set_updated_at();

alter table public.fall_2026_collective_attendees enable row level security;

revoke all on table public.fall_2026_collective_attendees from public, anon, authenticated;
grant select, insert, update, delete on table public.fall_2026_collective_attendees to service_role;

create or replace function private.provision_portal_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
begin
  if v_email = '' then
    return new;
  end if;

  insert into public.portal_users (
    user_id,
    email,
    first_name,
    last_name,
    is_admin
  )
  values (
    new.id,
    v_email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''),
    false
  )
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$$;

comment on function private.provision_portal_user_from_auth() is
  'Creates the portal_users row needed by dashboard RPCs when Supabase Auth creates a first-time passwordless login identity.';

revoke all on function private.provision_portal_user_from_auth() from public, anon, authenticated;

drop trigger if exists provision_portal_user_on_auth_insert on auth.users;
create trigger provision_portal_user_on_auth_insert
after insert on auth.users
for each row
execute function private.provision_portal_user_from_auth();

create or replace function private.normalize_collective_attendee_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select lower(btrim(coalesce(p_email, '')));
$$;

create or replace function private.normalize_collective_attendee_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

create or replace function private.user_can_manage_collective(p_collective_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null
    and (
      private.is_portal_admin()
      or exists (
        select 1
        from public.collective_hosts as ch
        where ch.collective_id = p_collective_id
          and ch.user_id = auth.uid()
      )
    );
$$;

comment on function private.user_can_manage_collective(text) is
  'Returns true when the authenticated user is a portal admin or a linked host for the Collective.';

revoke all on function private.user_can_manage_collective(text) from public, anon, authenticated;

drop function if exists public.get_public_collectives();
create function public.get_public_collectives()
returns table (
  id text,
  city text,
  cross_streets text,
  audience text,
  childcare_option text,
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
  host_user_ids uuid[],
  pending_host_emails text[]
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
      coalesce(attendee_counts.attendee_count, 0)::integer as attendee_count,
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_option,
      c.primary_host_phone,
      c.latitude,
      c.longitude,
      coalesce(nullif(pu.last_name, ''), nullif(ph.pending_last_name, ''), 'Host') as primary_host_last_name,
      coalesce(
        array_agg(ch_all.user_id order by ch_all.is_primary desc, ch_all.created_at)
          filter (where ch_all.user_id is not null),
        array[]::uuid[]
      ) as host_user_ids,
      coalesce(
        array_agg(ch_all.pending_email order by ch_all.is_primary desc, ch_all.created_at)
          filter (where ch_all.pending_email is not null),
        array[]::text[]
      ) as pending_host_emails
    from public.collectives as c
    join public.collective_hosts as ch_self
      on ch_self.collective_id = c.id
      and ch_self.user_id = v_user_id
    join public.collective_hosts as ch_all
      on ch_all.collective_id = c.id
    join public.collective_hosts as ph
      on ph.collective_id = c.id
      and ph.is_primary = true
    left join public.portal_users as pu
      on pu.user_id = ph.user_id
    left join lateral (
      select count(*)::integer as attendee_count
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_counts on true
    group by c.id, attendee_counts.attendee_count, pu.last_name, ph.pending_last_name
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
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_option text,
  primary_host_phone text,
  latitude double precision,
  longitude double precision,
  primary_host_user_id uuid,
  primary_host_email text,
  primary_host_first_name text,
  primary_host_last_name text,
  secondary_host_user_id uuid,
  secondary_host_email text
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
      coalesce(attendee_counts.attendee_count, 0)::integer as attendee_count,
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_option,
      c.primary_host_phone,
      c.latitude,
      c.longitude,
      ph.user_id as primary_host_user_id,
      coalesce(pu.email, ph.pending_email) as primary_host_email,
      coalesce(pu.first_name, ph.pending_first_name) as primary_host_first_name,
      coalesce(pu.last_name, ph.pending_last_name) as primary_host_last_name,
      sh.user_id as secondary_host_user_id,
      coalesce(su.email, sh.pending_email) as secondary_host_email
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
      select count(*)::integer as attendee_count
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_counts on true
    order by c.approval_status, c.listing_status, c.city, coalesce(pu.last_name, ph.pending_last_name, ph.pending_email), c.id;
end;
$$;

drop function if exists public.get_collective_attendees(text);
create function public.get_collective_attendees(p_collective_id text)
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
stable
security definer
set search_path = pg_catalog
as $$
begin
  if not private.user_can_manage_collective(p_collective_id) then
    raise exception 'Collective attendee access denied.' using errcode = '42501';
  end if;

  return query
    select
      a.id,
      a.first_name,
      a.last_name,
      a.phone,
      a.email,
      a.adult_count,
      a.child_count,
      a.signed_up_at,
      a.updated_at
    from public.fall_2026_collective_attendees as a
    where a.collective_id = p_collective_id
    order by a.signed_up_at, a.last_name, a.first_name, a.id;
end;
$$;

drop function if exists public.update_collective_attendee(uuid, jsonb);
create function public.update_collective_attendee(
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
  select *
  into v_existing
  from public.fall_2026_collective_attendees
  where id = p_attendee_id
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

drop function if exists public.remove_collective_attendee(uuid);
create function public.remove_collective_attendee(p_attendee_id uuid)
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
  select *
  into v_existing
  from public.fall_2026_collective_attendees
  where id = p_attendee_id
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
  v_existing_same_count integer := 0;
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
    count(*) filter (where collective_id = p_collective_id)
  into v_conflict_ids, v_conflict_collective_ids, v_existing_same_count
  from locked;

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

  if cardinality(v_conflict_collective_ids) = 1 and v_conflict_collective_ids[1] = p_collective_id then
    return jsonb_build_object(
      'status', 'same_collective',
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
  'Service-role only atomic signup/reassignment helper. Public browser requests must go through signup-collective-attendee.';

revoke all on function public.get_public_collectives() from public;
grant execute on function public.get_public_collectives() to anon, authenticated;
revoke all on function public.get_my_collectives() from public, anon;
grant execute on function public.get_my_collectives() to authenticated;
revoke all on function public.get_admin_collectives() from public, anon;
grant execute on function public.get_admin_collectives() to authenticated;
revoke all on function public.get_collective_attendees(text) from public, anon;
grant execute on function public.get_collective_attendees(text) to authenticated;
revoke all on function public.update_collective_attendee(uuid, jsonb) from public, anon;
grant execute on function public.update_collective_attendee(uuid, jsonb) to authenticated;
revoke all on function public.remove_collective_attendee(uuid) from public, anon;
grant execute on function public.remove_collective_attendee(uuid) to authenticated;
revoke all on function public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.complete_fall_2026_collective_signup(text, text, text, text, text, integer, integer, boolean) to service_role;

commit;
