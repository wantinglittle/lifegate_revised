begin;

-- One-time Community Host backfill needs to assign existing groups to their
-- resolved Auth owner without granting broad browser or table update access.
grant update (owner_user_id) on table public.groups to service_role;

commit;
