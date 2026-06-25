create table if not exists device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'used', 'expired', 'revoked')),
  expires_at timestamptz not null,
  used_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_pairing_codes_code_hash_unique_idx
  on device_pairing_codes(code_hash);

create index if not exists device_pairing_codes_subscriber_id_idx
  on device_pairing_codes(subscriber_id);

create index if not exists device_pairing_codes_status_expires_idx
  on device_pairing_codes(status, expires_at);

drop trigger if exists device_pairing_codes_set_updated_at on device_pairing_codes;
create trigger device_pairing_codes_set_updated_at
before update on device_pairing_codes
for each row
execute function set_updated_at();

create table if not exists device_registration_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  subscriber_id uuid not null references subscribers(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_registration_tokens_hash_unique_idx
  on device_registration_tokens(token_hash);

create index if not exists device_registration_tokens_subscriber_id_idx
  on device_registration_tokens(subscriber_id);

create index if not exists device_registration_tokens_status_expires_idx
  on device_registration_tokens(status, expires_at);

drop trigger if exists device_registration_tokens_set_updated_at on device_registration_tokens;
create trigger device_registration_tokens_set_updated_at
before update on device_registration_tokens
for each row
execute function set_updated_at();
