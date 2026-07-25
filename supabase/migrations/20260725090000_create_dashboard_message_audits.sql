begin;

create table if not exists public.dashboard_message_audits (
  message_id uuid primary key,
  sending_admin_user_id uuid not null references auth.users(id) on delete restrict,
  sending_admin_email text not null,
  subject text not null,
  recipient_count integer not null default 0,
  successful_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_invalid_count integer not null default 0,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  overall_status text not null default 'started',
  constraint dashboard_message_audits_status_allowed
    check (overall_status in ('started', 'completed', 'partial_failure', 'failed'))
);

comment on table public.dashboard_message_audits is
  'Minimal audit history for Dashboard Send Message emails. Message bodies are intentionally not stored.';

comment on column public.dashboard_message_audits.message_id is
  'Client-generated unique message ID used for audit correlation and duplicate-send protection.';

alter table public.dashboard_message_audits enable row level security;

revoke all on table public.dashboard_message_audits from public;
revoke all on table public.dashboard_message_audits from anon;
revoke all on table public.dashboard_message_audits from authenticated;
grant select, insert, update on table public.dashboard_message_audits to service_role;

commit;
