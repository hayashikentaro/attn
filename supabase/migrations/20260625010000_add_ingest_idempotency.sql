alter table notifications
  add column if not exists external_id text,
  add column if not exists dedupe_key text,
  add column if not exists schema_version text not null default '1';

create unique index if not exists notifications_source_external_id_unique_idx
  on notifications(source, external_id)
  where external_id is not null;

create unique index if not exists notifications_dedupe_key_unique_idx
  on notifications(dedupe_key)
  where dedupe_key is not null;
