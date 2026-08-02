begin;

alter table public.collectives
  add column if not exists max_size integer;

update public.collectives
set max_size = 12
where max_size is null
  or max_size not between 1 and 25;

alter table public.collectives
  alter column max_size set default 12,
  alter column max_size set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collectives_max_size_between_1_and_25'
      and conrelid = 'public.collectives'::regclass
  ) then
    alter table public.collectives
      add constraint collectives_max_size_between_1_and_25
      check (max_size between 1 and 25);
  end if;
end;
$$;

comment on column public.collectives.max_size is
  'Maximum total registered attendees this Collective can accommodate, including adults and children but not hosts.';

drop function if exists public.get_public_collectives();
create function public.get_public_collectives()
returns table (
  id text,
  city text,
  cross_streets text,
  audience text,
  childcare_option text,
  max_size integer,
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
      coalesce(attendee_counts.attendee_count, 0)::integer as attendee_count,
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
      select count(*)::integer as attendee_count
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_counts on true
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
      coalesce(attendee_counts.attendee_count, 0)::integer as attendee_count,
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
      select count(*)::integer as attendee_count
      from public.fall_2026_collective_attendees as a
      where a.collective_id = c.id
    ) as attendee_counts on true
    order by c.approval_status, c.listing_status, c.city, coalesce(pu.last_name, ph.pending_last_name, ph.pending_email), c.id;
end;
$$;

revoke all on function public.get_public_collectives() from public;
grant execute on function public.get_public_collectives() to anon, authenticated;
revoke all on function public.get_my_collectives() from public, anon;
grant execute on function public.get_my_collectives() to authenticated;
revoke all on function public.get_admin_collectives() from public, anon;
grant execute on function public.get_admin_collectives() to authenticated;

commit;
