begin;

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is
  'Small site-wide settings used by security-definer RPCs.';

drop trigger if exists set_site_settings_updated_at on public.site_settings;
create trigger set_site_settings_updated_at
before update on public.site_settings
for each row
execute function public.set_updated_at();

insert into public.site_settings (key, value)
values
  ('collectives_manual_override', '"automatic"'::jsonb),
  ('collectives_start_date', 'null'::jsonb),
  ('collectives_end_date', 'null'::jsonb)
on conflict (key) do nothing;

create table if not exists public.collectives (
  id text primary key default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz null,
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id) on delete set null,
  approval_status text not null default 'pending',
  listing_status text not null default 'inactive',
  city text not null,
  zip_code text not null,
  cross_streets text not null,
  formatted_location text null,
  audience text not null,
  childcare_provided boolean not null default false,
  primary_host_phone text not null,
  latitude double precision null,
  longitude double precision null
);

comment on table public.collectives is
  'Seasonal 7-week small-group gatherings. Public records expose approximate cross streets only.';
comment on column public.collectives.cross_streets is
  'Approximate public location. Hosts must not submit exact home addresses.';
comment on column public.collectives.formatted_location is
  'Approximate formatted location returned by Google geocoding.';
comment on column public.collectives.primary_host_phone is
  'Private admin/contact workflow phone value collected because portal_users currently has no phone field.';
comment on column public.collectives.approval_status is
  'Administrator approval state. Pending Collectives are never public.';
comment on column public.collectives.listing_status is
  'Host-controlled seasonal participation state after administrator approval.';

create table if not exists public.collective_hosts (
  id uuid primary key default gen_random_uuid(),
  collective_id text not null references public.collectives(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete cascade,
  pending_first_name text null,
  pending_last_name text null,
  pending_email text null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint collective_hosts_identity_required check (
    user_id is not null or (pending_email is not null and length(btrim(pending_email)) > 0)
  ),
  constraint collective_hosts_pending_email_format check (
    pending_email is null or pending_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint collective_hosts_primary_pending_name_required check (
    user_id is not null
      or is_primary = false
      or (
        pending_first_name is not null
        and length(btrim(pending_first_name)) > 0
        and char_length(pending_first_name) <= 80
        and pending_last_name is not null
        and length(btrim(pending_last_name)) > 0
        and char_length(pending_last_name) <= 80
      )
  )
);

comment on table public.collective_hosts is
  'Links one required primary and up to one secondary host to a Collective. Pending identity is retained until the matching portal user is linked.';
comment on column public.collective_hosts.pending_first_name is
  'Submitted primary host first name used until a pending host email is linked to portal_users.';
comment on column public.collective_hosts.pending_last_name is
  'Submitted primary host last name used until a pending host email is linked to portal_users.';
comment on column public.collective_hosts.pending_email is
  'Submitted host email used for account linking and contact fallback until a portal user is linked.';

create table if not exists public.collective_contact_message_audits (
  message_id uuid primary key,
  collective_id text not null references public.collectives(id) on delete cascade,
  sender_name text not null,
  sender_email text not null,
  sender_phone text null,
  recipient_count integer not null default 0,
  overall_status text not null,
  error_message text null,
  created_at timestamptz not null default now(),
  constraint collective_contact_audit_status_allowed check (overall_status in ('completed', 'failed'))
);

comment on table public.collective_contact_message_audits is
  'Server-side audit trail for public Contact Host messages sent to Collective hosts.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_approval_status_allowed'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_approval_status_allowed
      check (approval_status in ('pending', 'approved'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_listing_status_allowed'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_listing_status_allowed
      check (listing_status in ('active', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_approved_audit_required'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_approved_audit_required
      check (
        approval_status <> 'approved'
        or (approved_at is not null and approved_by is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_city_not_blank'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_city_not_blank
      check (length(btrim(city)) > 0 and char_length(city) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_zip_code_not_blank'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_zip_code_not_blank
      check (zip_code ~ '^[0-9]{5}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_cross_streets_not_blank'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_cross_streets_not_blank
      check (length(btrim(cross_streets)) > 0 and char_length(cross_streets) <= 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_audience_allowed'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_audience_allowed
      check (audience in ('All', 'Men', 'Women'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_latitude_range'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_latitude_range
      check (latitude is null or (latitude >= -90 and latitude <= 90));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'collectives_longitude_range'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_longitude_range
      check (longitude is null or (longitude >= -180 and longitude <= 180));
  end if;
end;
$$;

drop trigger if exists set_collectives_updated_at on public.collectives;
create trigger set_collectives_updated_at
before update on public.collectives
for each row
execute function public.set_updated_at();

create unique index if not exists collective_hosts_user_unique_idx
  on public.collective_hosts (collective_id, user_id)
  where user_id is not null;
create unique index if not exists collective_hosts_pending_email_unique_idx
  on public.collective_hosts (collective_id, lower(pending_email))
  where pending_email is not null;
create unique index if not exists collective_hosts_one_primary_idx
  on public.collective_hosts (collective_id)
  where is_primary = true;
create index if not exists collectives_public_listing_idx
  on public.collectives (approval_status, listing_status, city);
create index if not exists collective_hosts_collective_id_idx on public.collective_hosts (collective_id);
create index if not exists collective_hosts_user_id_idx on public.collective_hosts (user_id);
create index if not exists collective_hosts_pending_email_idx on public.collective_hosts (lower(pending_email));

create or replace function private.enforce_collective_host_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if (
    select count(*)
    from public.collective_hosts as ch
    where ch.collective_id = new.collective_id
      and (tg_op <> 'UPDATE' or ch.id <> old.id)
  ) >= 2 then
    raise exception 'A Collective may have no more than two hosts.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_collective_host_limit on public.collective_hosts;
create trigger enforce_collective_host_limit
before insert or update of collective_id on public.collective_hosts
for each row
execute function private.enforce_collective_host_limit();

create or replace function private.link_pending_collective_hosts_for_portal_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text;
begin
  v_email := lower(btrim(new.email));

  if v_email is null or length(v_email) = 0 then
    return new;
  end if;

  update public.collective_hosts as ch
  set
    user_id = new.user_id,
    pending_first_name = null,
    pending_last_name = null,
    pending_email = null
  where ch.user_id is null
    and ch.pending_email is not null
    and lower(ch.pending_email) = v_email
    and not exists (
      select 1
      from public.collective_hosts as existing
      where existing.collective_id = ch.collective_id
        and existing.user_id = new.user_id
    );

  return new;
end;
$$;

comment on function private.link_pending_collective_hosts_for_portal_user() is
  'Links pending Collective host emails to newly provisioned or email-updated portal_users rows. Pending identity is cleared after linking so portal_users becomes authoritative.';

revoke all on function private.link_pending_collective_hosts_for_portal_user() from public, anon, authenticated;

drop trigger if exists link_pending_collective_hosts_on_portal_user_change on public.portal_users;
create trigger link_pending_collective_hosts_on_portal_user_change
after insert or update of email on public.portal_users
for each row
execute function private.link_pending_collective_hosts_for_portal_user();

create or replace function private.collectives_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_override text;
  v_start date;
  v_end date;
begin
  select value #>> '{}' into v_override
  from public.site_settings
  where key = 'collectives_manual_override';

  if v_override = 'force_on' then
    return true;
  elsif v_override = 'force_off' then
    return false;
  end if;

  select nullif(value #>> '{}', '')::date into v_start
  from public.site_settings
  where key = 'collectives_start_date'
    and value <> 'null'::jsonb;

  select nullif(value #>> '{}', '')::date into v_end
  from public.site_settings
  where key = 'collectives_end_date'
    and value <> 'null'::jsonb;

  return v_start is not null
    and v_end is not null
    and current_date between v_start and v_end;
end;
$$;

create or replace function public.get_collectives_public_state()
returns table (
  enabled boolean,
  manual_override text,
  start_date date,
  end_date date
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    private.collectives_enabled() as enabled,
    coalesce((select value #>> '{}' from public.site_settings where key = 'collectives_manual_override'), 'automatic') as manual_override,
    (select nullif(value #>> '{}', '')::date from public.site_settings where key = 'collectives_start_date' and value <> 'null'::jsonb) as start_date,
    (select nullif(value #>> '{}', '')::date from public.site_settings where key = 'collectives_end_date' and value <> 'null'::jsonb) as end_date;
$$;

create or replace function public.get_public_collectives()
returns table (
  id text,
  city text,
  cross_streets text,
  audience text,
  childcare_provided boolean,
  primary_host_last_name text,
  latitude double precision,
  longitude double precision
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
    c.childcare_provided,
    coalesce(nullif(pu.last_name, ''), nullif(ph.pending_last_name, ''), 'Host') as primary_host_last_name,
    c.latitude,
    c.longitude
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

create or replace function public.get_my_collectives()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  approval_status text,
  listing_status text,
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_provided boolean,
  primary_host_phone text,
  latitude double precision,
  longitude double precision,
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
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_provided,
      c.primary_host_phone,
      c.latitude,
      c.longitude,
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
    group by c.id
    order by c.approval_status, c.listing_status, c.city, c.id;
end;
$$;

create or replace function public.get_admin_collectives()
returns table (
  id text,
  created_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  approval_status text,
  listing_status text,
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_provided boolean,
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
      c.city,
      c.zip_code,
      c.cross_streets,
      c.formatted_location,
      c.audience,
      c.childcare_provided,
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
    order by c.approval_status, c.listing_status, c.city, coalesce(pu.last_name, ph.pending_last_name, ph.pending_email), c.id;
end;
$$;

create or replace function public.get_collectives_settings_admin()
returns table (
  manual_override text,
  start_date date,
  end_date date,
  enabled boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not private.is_portal_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  return query select cps.manual_override, cps.start_date, cps.end_date, cps.enabled from public.get_collectives_public_state() as cps;
end;
$$;

create or replace function public.update_collectives_settings_admin(
  p_manual_override text,
  p_start_date date,
  p_end_date date
)
returns table (
  manual_override text,
  start_date date,
  end_date date,
  enabled boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not private.is_portal_admin() then raise exception 'Administrator access required.' using errcode = '42501'; end if;
  if p_manual_override not in ('automatic', 'force_on', 'force_off') then
    raise exception 'Manual override must be automatic, force_on, or force_off.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'Collectives start date cannot be after end date.' using errcode = '22023';
  end if;

  insert into public.site_settings (key, value)
  values
    ('collectives_manual_override', to_jsonb(p_manual_override)),
    ('collectives_start_date', to_jsonb(p_start_date)),
    ('collectives_end_date', to_jsonb(p_end_date))
  on conflict (key) do update set value = excluded.value;

  return query select * from public.get_collectives_settings_admin();
end;
$$;

alter table public.site_settings enable row level security;
alter table public.collectives enable row level security;
alter table public.collective_hosts enable row level security;
alter table public.collective_contact_message_audits enable row level security;

revoke all on table public.site_settings from public, anon, authenticated;
revoke all on table public.collectives from public, anon, authenticated;
revoke all on table public.collective_hosts from public, anon, authenticated;
revoke all on table public.collective_contact_message_audits from public, anon, authenticated;

grant select, insert, update on table public.site_settings to service_role;
grant select, insert, update on table public.collectives to service_role;
grant select, insert, update, delete on table public.collective_hosts to service_role;
grant select, insert, update on table public.collective_contact_message_audits to service_role;

revoke all on function private.collectives_enabled() from public, anon, authenticated;
revoke all on function private.enforce_collective_host_limit() from public, anon, authenticated;
revoke all on function public.get_collectives_public_state() from public;
grant execute on function public.get_collectives_public_state() to anon, authenticated;
revoke all on function public.get_public_collectives() from public;
grant execute on function public.get_public_collectives() to anon, authenticated;
revoke all on function public.get_my_collectives() from public, anon;
grant execute on function public.get_my_collectives() to authenticated;
revoke all on function public.get_admin_collectives() from public, anon;
grant execute on function public.get_admin_collectives() to authenticated;
revoke all on function public.get_collectives_settings_admin() from public, anon;
grant execute on function public.get_collectives_settings_admin() to authenticated;
revoke all on function public.update_collectives_settings_admin(text, date, date) from public, anon;
grant execute on function public.update_collectives_settings_admin(text, date, date) to authenticated;

commit;
