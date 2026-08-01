begin;

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
  if p_manual_override is null or p_manual_override not in ('automatic', 'force_on', 'force_off') then
    raise exception 'Manual override must be automatic, force_on, or force_off.' using errcode = '22023';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date > p_end_date then
    raise exception 'Collectives start date cannot be after end date.' using errcode = '22023';
  end if;

  insert into public.site_settings (key, value)
  values
    ('collectives_manual_override', to_jsonb(p_manual_override)),
    ('collectives_start_date', coalesce(to_jsonb(p_start_date), 'null'::jsonb)),
    ('collectives_end_date', coalesce(to_jsonb(p_end_date), 'null'::jsonb))
  on conflict (key) do update set value = excluded.value;

  return query select * from public.get_collectives_settings_admin();
end;
$$;

revoke all on function public.update_collectives_settings_admin(text, date, date) from public, anon;
grant execute on function public.update_collectives_settings_admin(text, date, date) to authenticated;

commit;
