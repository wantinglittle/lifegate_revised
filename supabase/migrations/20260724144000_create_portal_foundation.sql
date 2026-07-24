begin;

-- Migration: Create the LifeGate Portal database and authorization foundation.
--
-- This migration does not grant authenticated users direct access to
-- public.groups. Portal reads and writes go through narrow security-definer RPCs
-- so contacts cannot bypass field restrictions with ordinary table updates.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists public.portal_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.portal_users is
  'Provisioned portal accounts and admin permission flags for the LifeGate Portal.';
comment on column public.portal_users.user_id is
  'Matches auth.users.id. Group ownership is based on this value, not contact email text.';
comment on column public.portal_users.is_admin is
  'Additional portal permission. Administrators may also own groups as ordinary contacts.';

alter table public.portal_users enable row level security;

revoke all on table public.portal_users from public;
revoke all on table public.portal_users from anon;
revoke all on table public.portal_users from authenticated;
grant select, insert, update on table public.portal_users to service_role;

drop trigger if exists set_portal_users_updated_at on public.portal_users;

create trigger set_portal_users_updated_at
before update on public.portal_users
for each row
execute function public.set_updated_at();

alter table public.groups
  add column if not exists owner_user_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'groups_owner_user_id_fkey'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_owner_user_id_fkey
      foreign key (owner_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end;
$$;

comment on column public.groups.owner_user_id is
  'Portal owner/contact for this group. Existing migrated rows remain unassigned until explicitly mapped.';

create index if not exists groups_owner_user_id_idx on public.groups (owner_user_id);

do $$
begin
  if exists (
    select 1
    from public.groups as g
    where g.status not in ('approved', 'pending', 'archived', 'rejected', 'active', 'inactive')
  ) then
    raise exception 'Unsupported groups.status value found. Review and map statuses before applying portal foundation migration.';
  end if;
end;
$$;

alter table public.groups
  drop constraint if exists groups_status_allowed;

update public.groups
set status = case status
  when 'approved' then 'active'
  when 'pending' then 'pending'
  when 'archived' then 'inactive'
  when 'rejected' then 'inactive'
  when 'active' then 'active'
  when 'inactive' then 'inactive'
end;

alter table public.groups
  alter column status set default 'pending';

alter table public.groups
  add constraint groups_status_allowed
  check (status in ('pending', 'active', 'inactive'));

create or replace function private.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.portal_users as pu
      where pu.user_id = auth.uid()
        and pu.is_admin = true
    );
$$;

comment on function private.is_portal_admin() is
  'Returns true only when the authenticated user has a portal_users admin flag.';

revoke all on function private.is_portal_admin() from public;
revoke all on function private.is_portal_admin() from anon;
revoke all on function private.is_portal_admin() from authenticated;

create or replace function public.get_public_groups()
returns table (
  id text,
  title text,
  description text,
  day text,
  meeting_time time without time zone,
  audience text,
  age_group text,
  city text,
  zip_code text,
  cross_streets text,
  additional_info text,
  contact_email text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    g.id,
    g.title,
    g.description,
    g.day,
    g.meeting_time,
    g.audience,
    g.age_group,
    g.city,
    g.zip_code,
    g.cross_streets,
    g.additional_info,
    g.contact_email,
    g.latitude,
    g.longitude
  from public.groups as g
  where g.status = 'active'
  order by g.title, g.id;
$$;

comment on function public.get_public_groups() is
  'Returns only active group fields needed by the public website. It omits owner_user_id, contact_name, and contact_phone.';

revoke all on function public.get_public_groups() from public;
grant execute on function public.get_public_groups() to anon;
grant execute on function public.get_public_groups() to authenticated;

create or replace function public.get_my_communities()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  title text,
  description text,
  day text,
  meeting_time time without time zone,
  audience text,
  age_group text,
  city text,
  zip_code text,
  cross_streets text,
  additional_info text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text,
  latitude double precision,
  longitude double precision
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
      g.id,
      g.created_at,
      g.updated_at,
      g.submitted_at,
      g.title,
      g.description,
      g.day,
      g.meeting_time,
      g.audience,
      g.age_group,
      g.city,
      g.zip_code,
      g.cross_streets,
      g.additional_info,
      g.contact_name,
      g.contact_email,
      g.contact_phone,
      g.status,
      g.latitude,
      g.longitude
    from public.groups as g
    where g.owner_user_id = v_user_id
    order by g.title, g.id;
end;
$$;

comment on function public.get_my_communities() is
  'Returns pending, active, and inactive groups assigned to the authenticated portal user.';

revoke all on function public.get_my_communities() from public;
revoke all on function public.get_my_communities() from anon;
grant execute on function public.get_my_communities() to authenticated;

create or replace function public.get_admin_groups()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  title text,
  description text,
  day text,
  meeting_time time without time zone,
  audience text,
  age_group text,
  city text,
  zip_code text,
  cross_streets text,
  additional_info text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text,
  owner_user_id uuid,
  latitude double precision,
  longitude double precision
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
      g.id,
      g.created_at,
      g.updated_at,
      g.submitted_at,
      g.title,
      g.description,
      g.day,
      g.meeting_time,
      g.audience,
      g.age_group,
      g.city,
      g.zip_code,
      g.cross_streets,
      g.additional_info,
      g.contact_name,
      g.contact_email,
      g.contact_phone,
      g.status,
      g.owner_user_id,
      g.latitude,
      g.longitude
    from public.groups as g
    order by g.status, g.title, g.id;
end;
$$;

comment on function public.get_admin_groups() is
  'Returns all groups for authenticated portal administrators.';

revoke all on function public.get_admin_groups() from public;
revoke all on function public.get_admin_groups() from anon;
grant execute on function public.get_admin_groups() to authenticated;

drop function if exists public.update_my_community(text, text, text, text, text, text, text, time without time zone, text, text, text, text, text, text);
drop function if exists public.update_admin_group(text, text, text, text, text, text, text, time without time zone, text, text, text, text, text, text, double precision, double precision, text, uuid);
drop function if exists public.update_my_community(text, jsonb);
drop function if exists public.update_admin_group(text, jsonb);

create or replace function public.update_my_community(
  p_group_id text,
  p_changes jsonb
)
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  title text,
  description text,
  day text,
  meeting_time time without time zone,
  audience text,
  age_group text,
  city text,
  zip_code text,
  cross_streets text,
  additional_info text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text,
  latitude double precision,
  longitude double precision
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id text;
  v_group public.groups%rowtype;
  v_unknown_key text;
  v_title text;
  v_description text;
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
  v_day text;
  v_meeting_time time without time zone;
  v_audience text;
  v_age_group text;
  v_city text;
  v_zip_code text;
  v_cross_streets text;
  v_additional_info text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_group_id is null or length(btrim(p_group_id)) = 0 then
    raise exception 'Group ID is required.' using errcode = '22023';
  end if;
  v_group_id := btrim(p_group_id);

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Changes must be a JSON object.' using errcode = '22023';
  end if;

  if p_changes = '{}'::jsonb then
    raise exception 'At least one change is required.' using errcode = '22023';
  end if;

  select key
  into v_unknown_key
  from jsonb_object_keys(p_changes) as keys(key)
  where key not in (
    'title',
    'description',
    'contact_name',
    'contact_email',
    'contact_phone',
    'day',
    'meeting_time',
    'audience',
    'age_group',
    'city',
    'zip_code',
    'cross_streets',
    'additional_info'
  )
  limit 1;

  if v_unknown_key is not null then
    raise exception 'Field "%" cannot be updated by contacts.', v_unknown_key using errcode = '42501';
  end if;

  select g.*
  into v_group
  from public.groups as g
  where g.id = v_group_id
    and g.owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Group not found or not owned by authenticated user.' using errcode = '42501';
  end if;

  v_title := v_group.title;
  v_description := v_group.description;
  v_contact_name := v_group.contact_name;
  v_contact_email := v_group.contact_email;
  v_contact_phone := v_group.contact_phone;
  v_day := v_group.day;
  v_meeting_time := v_group.meeting_time;
  v_audience := v_group.audience;
  v_age_group := v_group.age_group;
  v_city := v_group.city;
  v_zip_code := v_group.zip_code;
  v_cross_streets := v_group.cross_streets;
  v_additional_info := v_group.additional_info;

  if p_changes ? 'title' then
    if jsonb_typeof(p_changes->'title') <> 'string' then
      raise exception 'title must be a nonblank string.' using errcode = '22023';
    end if;
    v_title := btrim(p_changes->>'title');
    if length(v_title) = 0 or char_length(v_title) > 120 then
      raise exception 'title must be nonblank and at most 120 characters.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'description' then
    if jsonb_typeof(p_changes->'description') <> 'string' then
      raise exception 'description must be a nonblank string.' using errcode = '22023';
    end if;
    v_description := btrim(p_changes->>'description');
    if length(v_description) = 0 then
      raise exception 'description must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_name' then
    if jsonb_typeof(p_changes->'contact_name') <> 'string' then
      raise exception 'contact_name must be a nonblank string.' using errcode = '22023';
    end if;
    v_contact_name := btrim(p_changes->>'contact_name');
    if length(v_contact_name) = 0 then
      raise exception 'contact_name must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_email' then
    if jsonb_typeof(p_changes->'contact_email') <> 'string' then
      raise exception 'contact_email must be a valid email string.' using errcode = '22023';
    end if;
    v_contact_email := btrim(p_changes->>'contact_email');
    if length(v_contact_email) = 0 or v_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'contact_email must be a valid email string.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_phone' then
    if jsonb_typeof(p_changes->'contact_phone') <> 'string' then
      raise exception 'contact_phone must be a nonblank string.' using errcode = '22023';
    end if;
    v_contact_phone := btrim(p_changes->>'contact_phone');
    if length(v_contact_phone) = 0 then
      raise exception 'contact_phone must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'day' then
    if jsonb_typeof(p_changes->'day') = 'null' then
      v_day := null;
    else
      if jsonb_typeof(p_changes->'day') <> 'string' then
        raise exception 'day must be null or a valid weekday string.' using errcode = '22023';
      end if;
      v_day := btrim(p_changes->>'day');
      if v_day not in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') then
        raise exception 'day must be null or a valid weekday string.' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_changes ? 'meeting_time' then
    if jsonb_typeof(p_changes->'meeting_time') = 'null' then
      v_meeting_time := null;
    else
      if jsonb_typeof(p_changes->'meeting_time') <> 'string' then
        raise exception 'meeting_time must be null or a valid time string.' using errcode = '22023';
      end if;
      begin
        v_meeting_time := (p_changes->>'meeting_time')::time without time zone;
      exception
        when others then
          raise exception 'meeting_time must be null or a valid time string.' using errcode = '22023';
      end;
    end if;
  end if;

  if p_changes ? 'audience' then
    if jsonb_typeof(p_changes->'audience') <> 'string' then
      raise exception 'audience must be All, Men, or Women.' using errcode = '22023';
    end if;
    v_audience := btrim(p_changes->>'audience');
    if v_audience not in ('All', 'Men', 'Women') then
      raise exception 'audience must be All, Men, or Women.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'age_group' then
    if jsonb_typeof(p_changes->'age_group') <> 'string' then
      raise exception 'age_group must be All-ages, Kids, Teens, or Adult.' using errcode = '22023';
    end if;
    v_age_group := btrim(p_changes->>'age_group');
    if v_age_group not in ('All-ages', 'Kids', 'Teens', 'Adult') then
      raise exception 'age_group must be All-ages, Kids, Teens, or Adult.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'city' then
    if jsonb_typeof(p_changes->'city') <> 'string' then
      raise exception 'city must be a nonblank string.' using errcode = '22023';
    end if;
    v_city := btrim(p_changes->>'city');
    if length(v_city) = 0 or char_length(v_city) > 120 then
      raise exception 'city must be nonblank and at most 120 characters.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'zip_code' then
    if jsonb_typeof(p_changes->'zip_code') <> 'string' then
      raise exception 'zip_code must be a nonblank string.' using errcode = '22023';
    end if;
    v_zip_code := btrim(p_changes->>'zip_code');
    if length(v_zip_code) = 0 then
      raise exception 'zip_code must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'cross_streets' then
    if jsonb_typeof(p_changes->'cross_streets') <> 'string' then
      raise exception 'cross_streets must be a nonblank string.' using errcode = '22023';
    end if;
    v_cross_streets := btrim(p_changes->>'cross_streets');
    if length(v_cross_streets) = 0 then
      raise exception 'cross_streets must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'additional_info' then
    if jsonb_typeof(p_changes->'additional_info') = 'null' then
      v_additional_info := null;
    else
      if jsonb_typeof(p_changes->'additional_info') <> 'string' then
        raise exception 'additional_info must be null or a string.' using errcode = '22023';
      end if;
      v_additional_info := btrim(p_changes->>'additional_info');
    end if;
  end if;

  return query
    update public.groups as g
    set
      title = v_title,
      description = v_description,
      contact_name = v_contact_name,
      contact_email = v_contact_email,
      contact_phone = v_contact_phone,
      day = v_day,
      meeting_time = v_meeting_time,
      audience = v_audience,
      age_group = v_age_group,
      city = v_city,
      zip_code = v_zip_code,
      cross_streets = v_cross_streets,
      additional_info = v_additional_info
    where g.id = v_group.id
    returning
      g.id,
      g.created_at,
      g.updated_at,
      g.submitted_at,
      g.title,
      g.description,
      g.day,
      g.meeting_time,
      g.audience,
      g.age_group,
      g.city,
      g.zip_code,
      g.cross_streets,
      g.additional_info,
      g.contact_name,
      g.contact_email,
      g.contact_phone,
      g.status,
      g.latitude,
      g.longitude;
end;
$$;

comment on function public.update_my_community(text, jsonb) is
  'Patch-updates only contact-editable content fields for a group owned by the authenticated portal user. Omitted JSON keys remain unchanged; JSON null clears only nullable fields.';

revoke all on function public.update_my_community(text, jsonb) from public;
revoke all on function public.update_my_community(text, jsonb) from anon;
grant execute on function public.update_my_community(text, jsonb) to authenticated;

create or replace function public.update_admin_group(
  p_group_id text,
  p_changes jsonb
)
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  title text,
  description text,
  day text,
  meeting_time time without time zone,
  audience text,
  age_group text,
  city text,
  zip_code text,
  cross_streets text,
  additional_info text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text,
  owner_user_id uuid,
  latitude double precision,
  longitude double precision
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_group_id text;
  v_group public.groups%rowtype;
  v_unknown_key text;
  v_title text;
  v_description text;
  v_contact_name text;
  v_contact_email text;
  v_contact_phone text;
  v_day text;
  v_meeting_time time without time zone;
  v_audience text;
  v_age_group text;
  v_city text;
  v_zip_code text;
  v_cross_streets text;
  v_additional_info text;
  v_latitude double precision;
  v_longitude double precision;
  v_status text;
  v_owner_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not private.is_portal_admin() then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  if p_group_id is null or length(btrim(p_group_id)) = 0 then
    raise exception 'Group ID is required.' using errcode = '22023';
  end if;
  v_group_id := btrim(p_group_id);

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Changes must be a JSON object.' using errcode = '22023';
  end if;

  if p_changes = '{}'::jsonb then
    raise exception 'At least one change is required.' using errcode = '22023';
  end if;

  select key
  into v_unknown_key
  from jsonb_object_keys(p_changes) as keys(key)
  where key not in (
    'title',
    'description',
    'contact_name',
    'contact_email',
    'contact_phone',
    'day',
    'meeting_time',
    'audience',
    'age_group',
    'city',
    'zip_code',
    'cross_streets',
    'additional_info',
    'latitude',
    'longitude',
    'status',
    'owner_user_id'
  )
  limit 1;

  if v_unknown_key is not null then
    raise exception 'Field "%" cannot be updated by admins.', v_unknown_key using errcode = '42501';
  end if;

  if (p_changes ? 'latitude') <> (p_changes ? 'longitude') then
    raise exception 'latitude and longitude must be updated together.' using errcode = '22023';
  end if;

  select g.*
  into v_group
  from public.groups as g
  where g.id = v_group_id
  for update;

  if not found then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;

  v_title := v_group.title;
  v_description := v_group.description;
  v_contact_name := v_group.contact_name;
  v_contact_email := v_group.contact_email;
  v_contact_phone := v_group.contact_phone;
  v_day := v_group.day;
  v_meeting_time := v_group.meeting_time;
  v_audience := v_group.audience;
  v_age_group := v_group.age_group;
  v_city := v_group.city;
  v_zip_code := v_group.zip_code;
  v_cross_streets := v_group.cross_streets;
  v_additional_info := v_group.additional_info;
  v_latitude := v_group.latitude;
  v_longitude := v_group.longitude;
  v_status := v_group.status;
  v_owner_user_id := v_group.owner_user_id;

  if p_changes ? 'title' then
    if jsonb_typeof(p_changes->'title') <> 'string' then
      raise exception 'title must be a nonblank string.' using errcode = '22023';
    end if;
    v_title := btrim(p_changes->>'title');
    if length(v_title) = 0 or char_length(v_title) > 120 then
      raise exception 'title must be nonblank and at most 120 characters.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'description' then
    if jsonb_typeof(p_changes->'description') <> 'string' then
      raise exception 'description must be a nonblank string.' using errcode = '22023';
    end if;
    v_description := btrim(p_changes->>'description');
    if length(v_description) = 0 then
      raise exception 'description must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_name' then
    if jsonb_typeof(p_changes->'contact_name') <> 'string' then
      raise exception 'contact_name must be a nonblank string.' using errcode = '22023';
    end if;
    v_contact_name := btrim(p_changes->>'contact_name');
    if length(v_contact_name) = 0 then
      raise exception 'contact_name must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_email' then
    if jsonb_typeof(p_changes->'contact_email') <> 'string' then
      raise exception 'contact_email must be a valid email string.' using errcode = '22023';
    end if;
    v_contact_email := btrim(p_changes->>'contact_email');
    if length(v_contact_email) = 0 or v_contact_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'contact_email must be a valid email string.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'contact_phone' then
    if jsonb_typeof(p_changes->'contact_phone') <> 'string' then
      raise exception 'contact_phone must be a nonblank string.' using errcode = '22023';
    end if;
    v_contact_phone := btrim(p_changes->>'contact_phone');
    if length(v_contact_phone) = 0 then
      raise exception 'contact_phone must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'day' then
    if jsonb_typeof(p_changes->'day') = 'null' then
      v_day := null;
    else
      if jsonb_typeof(p_changes->'day') <> 'string' then
        raise exception 'day must be null or a valid weekday string.' using errcode = '22023';
      end if;
      v_day := btrim(p_changes->>'day');
      if v_day not in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday') then
        raise exception 'day must be null or a valid weekday string.' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_changes ? 'meeting_time' then
    if jsonb_typeof(p_changes->'meeting_time') = 'null' then
      v_meeting_time := null;
    else
      if jsonb_typeof(p_changes->'meeting_time') <> 'string' then
        raise exception 'meeting_time must be null or a valid time string.' using errcode = '22023';
      end if;
      begin
        v_meeting_time := (p_changes->>'meeting_time')::time without time zone;
      exception
        when others then
          raise exception 'meeting_time must be null or a valid time string.' using errcode = '22023';
      end;
    end if;
  end if;

  if p_changes ? 'audience' then
    if jsonb_typeof(p_changes->'audience') <> 'string' then
      raise exception 'audience must be All, Men, or Women.' using errcode = '22023';
    end if;
    v_audience := btrim(p_changes->>'audience');
    if v_audience not in ('All', 'Men', 'Women') then
      raise exception 'audience must be All, Men, or Women.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'age_group' then
    if jsonb_typeof(p_changes->'age_group') <> 'string' then
      raise exception 'age_group must be All-ages, Kids, Teens, or Adult.' using errcode = '22023';
    end if;
    v_age_group := btrim(p_changes->>'age_group');
    if v_age_group not in ('All-ages', 'Kids', 'Teens', 'Adult') then
      raise exception 'age_group must be All-ages, Kids, Teens, or Adult.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'city' then
    if jsonb_typeof(p_changes->'city') <> 'string' then
      raise exception 'city must be a nonblank string.' using errcode = '22023';
    end if;
    v_city := btrim(p_changes->>'city');
    if length(v_city) = 0 or char_length(v_city) > 120 then
      raise exception 'city must be nonblank and at most 120 characters.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'zip_code' then
    if jsonb_typeof(p_changes->'zip_code') <> 'string' then
      raise exception 'zip_code must be a nonblank string.' using errcode = '22023';
    end if;
    v_zip_code := btrim(p_changes->>'zip_code');
    if length(v_zip_code) = 0 then
      raise exception 'zip_code must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'cross_streets' then
    if jsonb_typeof(p_changes->'cross_streets') <> 'string' then
      raise exception 'cross_streets must be a nonblank string.' using errcode = '22023';
    end if;
    v_cross_streets := btrim(p_changes->>'cross_streets');
    if length(v_cross_streets) = 0 then
      raise exception 'cross_streets must be nonblank.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'additional_info' then
    if jsonb_typeof(p_changes->'additional_info') = 'null' then
      v_additional_info := null;
    else
      if jsonb_typeof(p_changes->'additional_info') <> 'string' then
        raise exception 'additional_info must be null or a string.' using errcode = '22023';
      end if;
      v_additional_info := btrim(p_changes->>'additional_info');
    end if;
  end if;

  if p_changes ? 'latitude' then
    if jsonb_typeof(p_changes->'latitude') = 'null' and jsonb_typeof(p_changes->'longitude') = 'null' then
      v_latitude := null;
      v_longitude := null;
    else
      if jsonb_typeof(p_changes->'latitude') <> 'number' or jsonb_typeof(p_changes->'longitude') <> 'number' then
        raise exception 'latitude and longitude must both be null or both be numbers.' using errcode = '22023';
      end if;
      v_latitude := (p_changes->>'latitude')::double precision;
      v_longitude := (p_changes->>'longitude')::double precision;
      if v_latitude < -90 or v_latitude > 90 then
        raise exception 'latitude must be between -90 and 90.' using errcode = '22023';
      end if;
      if v_longitude < -180 or v_longitude > 180 then
        raise exception 'longitude must be between -180 and 180.' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_changes ? 'status' then
    if jsonb_typeof(p_changes->'status') <> 'string' then
      raise exception 'status must be pending, active, or inactive.' using errcode = '22023';
    end if;
    v_status := btrim(p_changes->>'status');
    if v_status not in ('pending', 'active', 'inactive') then
      raise exception 'status must be pending, active, or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_changes ? 'owner_user_id' then
    if jsonb_typeof(p_changes->'owner_user_id') = 'null' then
      v_owner_user_id := null;
    else
      if jsonb_typeof(p_changes->'owner_user_id') <> 'string' then
        raise exception 'owner_user_id must be null or a valid auth user UUID string.' using errcode = '22023';
      end if;
      begin
        v_owner_user_id := (p_changes->>'owner_user_id')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'owner_user_id must be null or a valid auth user UUID string.' using errcode = '22023';
      end;

      if not exists (
        select 1
        from auth.users as u
        where u.id = v_owner_user_id
      ) then
        raise exception 'owner_user_id does not reference an existing auth user.' using errcode = '23503';
      end if;
    end if;
  end if;

  return query
    update public.groups as g
    set
      title = v_title,
      description = v_description,
      contact_name = v_contact_name,
      contact_email = v_contact_email,
      contact_phone = v_contact_phone,
      day = v_day,
      meeting_time = v_meeting_time,
      audience = v_audience,
      age_group = v_age_group,
      city = v_city,
      zip_code = v_zip_code,
      cross_streets = v_cross_streets,
      additional_info = v_additional_info,
      latitude = v_latitude,
      longitude = v_longitude,
      status = v_status,
      owner_user_id = v_owner_user_id
    where g.id = v_group.id
    returning
      g.id,
      g.created_at,
      g.updated_at,
      g.submitted_at,
      g.title,
      g.description,
      g.day,
      g.meeting_time,
      g.audience,
      g.age_group,
      g.city,
      g.zip_code,
      g.cross_streets,
      g.additional_info,
      g.contact_name,
      g.contact_email,
      g.contact_phone,
      g.status,
      g.owner_user_id,
      g.latitude,
      g.longitude;
end;
$$;

comment on function public.update_admin_group(text, jsonb) is
  'Patch-updates normal group fields, status, coordinates, and owner assignment for authenticated portal administrators. Omitted JSON keys remain unchanged; JSON null clears only nullable fields.';

revoke all on function public.update_admin_group(text, jsonb) from public;
revoke all on function public.update_admin_group(text, jsonb) from anon;
grant execute on function public.update_admin_group(text, jsonb) to authenticated;

revoke all on table public.groups from public;
revoke all on table public.groups from anon;
revoke all on table public.groups from authenticated;

commit;
