create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel text not null check (channel in ('slack', 'novu', 'push', 'email', 'in_app')),
  provider text not null check (provider in ('slack_webhook', 'novu', 'expo', 'fcm', 'apns', 'none')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_deliveries_notification_id_idx
  on notification_deliveries(notification_id, created_at desc);

create index if not exists notification_deliveries_status_idx
  on notification_deliveries(status);

drop trigger if exists notification_deliveries_set_updated_at on notification_deliveries;
create trigger notification_deliveries_set_updated_at
before update on notification_deliveries
for each row
execute function set_updated_at();

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  display_name text,
  email text,
  novu_subscriber_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscribers_external_id_unique_idx
  on subscribers(external_id);

drop trigger if exists subscribers_set_updated_at on subscribers;
create trigger subscribers_set_updated_at
before update on subscribers
for each row
execute function set_updated_at();

create table if not exists subscriber_devices (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web', 'expo')),
  provider text not null check (provider in ('expo', 'fcm', 'apns', 'web_push')),
  device_token_hash text not null,
  device_name text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriber_devices_token_unique_idx
  on subscriber_devices(subscriber_id, provider, device_token_hash);

create index if not exists subscriber_devices_subscriber_id_idx
  on subscriber_devices(subscriber_id);

create index if not exists subscriber_devices_active_idx
  on subscriber_devices(subscriber_id, provider)
  where revoked_at is null;

drop trigger if exists subscriber_devices_set_updated_at on subscriber_devices;
create trigger subscriber_devices_set_updated_at
before update on subscriber_devices
for each row
execute function set_updated_at();
