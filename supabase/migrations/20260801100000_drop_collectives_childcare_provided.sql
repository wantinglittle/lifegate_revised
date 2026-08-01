begin;

drop trigger if exists sync_collectives_childcare_columns on public.collectives;
drop function if exists private.sync_collectives_childcare_columns();

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
    c.childcare_option,
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
  city text,
  zip_code text,
  cross_streets text,
  formatted_location text,
  audience text,
  childcare_option text,
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
      c.childcare_option,
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
    order by c.approval_status, c.listing_status, c.city, coalesce(pu.last_name, ph.pending_last_name, ph.pending_email), c.id;
end;
$$;

revoke all on function public.get_public_collectives() from public;
grant execute on function public.get_public_collectives() to anon, authenticated;
revoke all on function public.get_my_collectives() from public, anon;
grant execute on function public.get_my_collectives() to authenticated;
revoke all on function public.get_admin_collectives() from public, anon;
grant execute on function public.get_admin_collectives() to authenticated;

do $$
begin
  if exists (
    select 1
    from public.collectives
    where childcare_option is null
      or childcare_option not in (
        'Childcare Available | Sitter Provided',
        'Children Welcome | No Sitter Provided',
        'Childcare Not Provided'
      )
  ) then
    raise exception 'Collectives childcare_option values must be valid and non-null before dropping the legacy column.' using errcode = '23514';
  end if;
end;
$$;

alter table public.collectives
  drop column if exists childcare_provided;

commit;
