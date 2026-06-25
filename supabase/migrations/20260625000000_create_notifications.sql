create extension if not exists pgcrypto;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  kind text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'new' check (status in ('new', 'seen', 'acknowledged', 'snoozed', 'resolved')),
  title text not null,
  summary text not null,
  detail text,
  why_it_matters text,
  suggested_action text,
  source_url text,
  related_run_id text,
  related_task_id text,
  payload_json jsonb not null default '{}'::jsonb,
  snoozed_until timestamptz,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  event_type text not null,
  actor text not null default 'system',
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notifications_status_idx on notifications(status);
create index if not exists notifications_priority_idx on notifications(priority);
create index if not exists notifications_source_idx on notifications(source);
create index if not exists notifications_kind_idx on notifications(kind);
create index if not exists notifications_snoozed_until_idx on notifications(snoozed_until);
create index if not exists notifications_updated_at_idx on notifications(updated_at desc);
create index if not exists notifications_occurred_at_idx on notifications(occurred_at desc);
create index if not exists notification_events_notification_id_idx on notification_events(notification_id, created_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
before update on notifications
for each row
execute function set_updated_at();
