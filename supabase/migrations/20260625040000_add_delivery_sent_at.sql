alter table notification_deliveries
  add column if not exists sent_at timestamptz;

create index if not exists notification_deliveries_sent_at_idx
  on notification_deliveries(sent_at desc)
  where sent_at is not null;
