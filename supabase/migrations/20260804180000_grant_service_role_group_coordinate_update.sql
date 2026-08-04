begin;

-- Server-side geocoding backfill updates only stored map coordinates for
-- existing Community records. Browser clients still cannot update the table.
grant update (latitude, longitude) on table public.groups to service_role;

commit;
