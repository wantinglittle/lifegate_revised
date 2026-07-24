-- Migration: Create the initial Supabase/PostgreSQL schema for LIFEGATE groups.
--
-- This migration intentionally models the permanent PostgreSQL shape, not the
-- legacy Firestore document shape. In particular, Firestore's legacy `hidden`
-- field is not stored here; publication is represented by `status`.
--
-- Existing Firestore document IDs should be imported into `public.groups.id`.
-- New post-migration records receive a generated text UUID by default.

create table if not exists public.groups (
  id text primary key default gen_random_uuid()::text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz null,

  title text not null,
  description text not null,
  day text null,
  meeting_time time without time zone null,
  audience text not null,
  age_group text not null,
  city text not null,
  zip_code text not null,
  cross_streets text not null,
  additional_info text null,

  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,

  status text not null default 'pending',

  latitude double precision null,
  longitude double precision null
);

comment on table public.groups is
  'Community groups migrated from Firestore and later managed through server-side Supabase code.';
comment on column public.groups.id is
  'Preserves the original Firestore document ID during import; generated for new PostgreSQL records.';
comment on column public.groups.status is
  'Canonical publication workflow field. Legacy Firestore hidden values are converted during import and not retained.';
comment on column public.groups.meeting_time is
  'Converted from Firestore hour/minute/ampm string fields during import.';
comment on column public.groups.contact_email is
  'Visible to browser clients through public.get_public_groups() for the current contact button; may later be replaced by a server-side contact relay.';

-- Data-quality checks are named and added conditionally so re-running the
-- migration is less likely to fail in review or reset workflows.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_title_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_title_not_blank
      check (length(btrim(title)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_description_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_description_not_blank
      check (length(btrim(description)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_contact_name_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_contact_name_not_blank
      check (length(btrim(contact_name)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_contact_email_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_contact_email_not_blank
      check (length(btrim(contact_email)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_contact_phone_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_contact_phone_not_blank
      check (length(btrim(contact_phone)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_city_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_city_not_blank
      check (length(btrim(city)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_zip_code_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_zip_code_not_blank
      check (length(btrim(zip_code)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_cross_streets_not_blank'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_cross_streets_not_blank
      check (length(btrim(cross_streets)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_title_length'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_title_length
      check (char_length(title) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_city_length'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_city_length
      check (char_length(city) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_contact_email_format'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_contact_email_format
      check (contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_status_allowed'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_status_allowed
      check (status in ('pending', 'approved', 'rejected', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_audience_allowed'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_audience_allowed
      check (audience in ('All', 'Men', 'Women'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_age_group_allowed'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_age_group_allowed
      check (age_group in ('All-ages', 'Kids', 'Teens', 'Adult'));
  end if;

  -- Future import scripts must convert legacy empty-string day values to NULL
  -- before insertion.
  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_day_allowed'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_day_allowed
      check (
        day is null
        or day in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_latitude_range'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_longitude_range'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;
end;
$$;

-- Reusable updated_at trigger helper. The fixed search_path prevents accidental
-- object shadowing when the function runs.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_groups_updated_at on public.groups;

create trigger set_groups_updated_at
before update on public.groups
for each row
execute function public.set_updated_at();

create index if not exists groups_status_idx on public.groups (status);
create index if not exists groups_day_idx on public.groups (day);
create index if not exists groups_audience_idx on public.groups (audience);
create index if not exists groups_age_group_idx on public.groups (age_group);
create index if not exists groups_city_idx on public.groups (city);
create index if not exists groups_submitted_at_idx on public.groups (submitted_at);

alter table public.groups enable row level security;

-- The website must not query the base table directly. Future server-side code
-- should use service-role credentials for inserts and administrative actions.
revoke all on table public.groups from public;
revoke all on table public.groups from anon;
revoke all on table public.groups from authenticated;

grant usage on schema public to anon;
grant usage on schema public to authenticated;

-- Do not add permissive table policies in this phase. Approved public records
-- are exposed only through this narrow RPC function.
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
set search_path = pg_catalog, public
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
  where g.status = 'approved'
  order by g.title, g.id;
$$;

comment on function public.get_public_groups() is
  'Returns only approved group fields needed by the public website. contact_email is intentionally exposed to browser clients for the current contact button and may later move behind a server-side contact relay.';

revoke all on function public.get_public_groups() from public;
grant execute on function public.get_public_groups() to anon;
grant execute on function public.get_public_groups() to authenticated;
