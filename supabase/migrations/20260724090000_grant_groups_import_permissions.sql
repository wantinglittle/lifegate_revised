-- Grants the minimum Data API permissions needed by trusted server-side
-- migration code that uses a Supabase secret key or legacy service-role key.
-- The service_role bypasses Row Level Security, so this grant must not be used
-- by browser clients or other untrusted code.
-- anon and authenticated remain unable to access the public.groups base table.
-- update and delete are intentionally not granted for this first-import utility.

grant select, insert on table public.groups to service_role;
