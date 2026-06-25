# Attn

Attn is a queue for human attention and decisions. It is not a chat app or a Slack clone: Slack can still be used as a safety bell, while Attn keeps the durable state of what needs action.

The MVP focuses on notification items from deployments and agents:

- `/queue` shows **Needs you**, **Later**, and **Done**.
- `/items/[id]` shows detail, raw payload JSON, and action history.
- `/api/notifications` ingests new notification events.
- State changes create event history rows.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a Postgres database and set `DATABASE_URL`. Supabase Postgres works, but plain Postgres is enough.

Run the schema migrations in your database:

```bash
for file in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$file"
done
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3999/queue`.

## Environment Variables

Core:

```env
DATABASE_URL=
NEXT_PUBLIC_APP_BASE_URL=
APP_BASE_URL=
ATTN_INGEST_TOKEN=
```

Optional fan-out:

```env
SLACK_WEBHOOK_URL=
NOVU_SECRET_KEY=
NOVU_WORKFLOW_ID=
NOVU_SUBSCRIBER_ID=
ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID=
```

Only `DATABASE_URL` is required for core functionality.

If `ATTN_INGEST_TOKEN` is set, ingestion requires either:

- `Authorization: Bearer <token>`
- `x-attn-token: <token>`

If `ATTN_INGEST_TOKEN` is not set, ingestion is open for local development.

## Create Demo Data

After the migration is applied:

```bash
npm run seed
```

The seed creates deployment, checkpoint, low-priority, snoozed, and resolved examples. It intentionally skips Slack and Novu fan-out.

## Ingest A Notification

Normal ingest:

```bash
curl -X POST http://localhost:3999/api/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{
    "source": "agent",
    "title": "Checkpoint needs approval",
    "summary": "A deployment checkpoint is waiting.",
    "priority": "normal"
  }'
```

Ingest with `external_id`, `dedupe_key`, and `schema_version`:

```bash
curl -X POST http://localhost:3999/api/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{
    "source": "vercel",
    "kind": "error",
    "priority": "high",
    "external_id": "deployment_123",
    "dedupe_key": "vercel:deployment_123:production",
    "schema_version": "1",
    "title": "Production deployment failed",
    "summary": "Build failed during production deployment.",
    "why_it_matters": "Production remains on the previous version.",
    "suggested_action": "Open the deployment logs and inspect the build error.",
    "source_url": "https://vercel.com/example"
  }'
```

Required fields are `source`, `title`, and `summary`. `kind` defaults to `info`, `priority` defaults to `normal`, `schema_version` defaults to `1`, `occurred_at` defaults to now, and `payload_json` defaults to `{}`.

Use `external_id` when the source system has a stable event, request, or deployment ID. Attn deduplicates `external_id` per `source`, so external systems can safely retry delivery.

Use `dedupe_key` when multiple source events should collapse to the same Attn item. Attn treats `dedupe_key` as globally unique across sources.

Use `schema_version` to identify the sender payload shape. It defaults to `"1"` so old senders stay stable.

When an ingest request matches an existing `source + external_id` or `dedupe_key`, Attn does not create another notification. It returns the existing item with `duplicated: true` and records `duplicate_received` in event history.

Ingest request bodies are capped at 64 KB for MVP safety.

Example duplicate response:

```json
{
  "notification": {
    "id": "existing-notification-id"
  },
  "duplicated": true
}
```

Minimal idempotent ingest:

```bash
curl -X POST http://localhost:3999/api/notifications \
  -H "Content-Type: application/json" \
  -H "x-attn-token: $ATTN_INGEST_TOKEN" \
  -d '{
    "source": "vercel",
    "external_id": "deployment_123",
    "title": "Production deployment failed",
    "summary": "Build failed during production deployment."
  }'
```

Duplicate ingest with the same `external_id`:

```bash
curl -X POST http://localhost:3999/api/notifications \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{
    "source": "vercel",
    "external_id": "deployment_123",
    "title": "Retried deployment payload",
    "summary": "This returns the existing Attn item.",
    "priority": "high"
  }'
```

Health check:

```bash
curl http://localhost:3999/api/health
```

Device register for a future mobile shell:

```bash
curl -X POST http://localhost:3999/api/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "ios",
    "provider": "expo",
    "device_token": "ExponentPushToken[...]",
    "device_name": "iPhone",
    "metadata": {}
  }'
```

Device unregister:

```bash
curl -X POST http://localhost:3999/api/devices/unregister \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "expo",
    "device_token": "ExponentPushToken[...]"
  }'
```

## API

- `GET /api/health` returns app status and database connectivity without exposing secrets.
- `POST /api/notifications` creates a notification and records `created`.
- `GET /api/notifications?bucket=needs_you` lists notifications. Buckets: `needs_you`, `later`, `done`, `all`.
- `GET /api/notifications/[id]` returns one notification with event history.
- `POST /api/notifications/[id]/acknowledge` marks acknowledged.
- `POST /api/notifications/[id]/snooze` accepts `{ "until": "..." }` or `{ "minutes": 60 }`.
- `POST /api/notifications/[id]/resolve` marks done.
- `POST /api/notifications/[id]/reopen` moves the item back to new.
- `POST /api/notifications/[id]/decision` records `decision:<value>` for checkpoint-style items.
- `POST /api/devices/register` creates or updates a future Push device record. Raw device tokens are accepted by the API but are not returned.
- `POST /api/devices/unregister` revokes a device by id or by provider plus device token.

Allowed decisions are `approve`, `approve_with_condition`, `reject`, `ask_follow_up`, and `suspend`.

## Queue Semantics

Attn stores internal statuses, but the UI groups them into three human buckets:

- **Needs you**: `new`, `seen`, `acknowledged`, and expired `snoozed`.
- **Later**: `snoozed` with `snoozed_until` in the future.
- **Done**: `resolved`.

The database is the source of truth. Every meaningful state transition writes a row to `notification_events`.

## Delivery State

Attn records delivery bookkeeping in `notification_deliveries`.

Every notification gets an `in_app` / `none` delivery row because the database-backed queue is the source of truth.

Routing is code-defined for now:

- `critical` items create the Attn item, route to Slack and Novu when configured, and record a skipped future `push` delivery.
- `high` priority items create the Attn item and route to Slack and Novu when configured.
- `decision_request` and `checkpoint` items create the Attn item, route to Novu when configured, and route to Slack when configured so the Slack message can point back to Attn.
- `normal` and `low` priority items stay in Attn only.

When a high/critical/checkpoint route wants Slack or Novu but the provider is not configured, Attn records a skipped delivery row with a reason such as `slack_not_configured` or `novu_not_configured`. Delivery rows track `channel`, `provider`, `status`, `attempts`, `last_error`, and non-secret metadata. Slack and Novu failures do not fail notification creation; Attn stores the notification, records the failed delivery state, and keeps the item in the queue.

## Subscribers And Devices

Attn now has a minimal subscriber and device-token foundation for the future mobile app.

If an incoming device registration does not specify `subscriber_id`, Attn uses a default subscriber. The default external id is `ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID` or `attn-operator`; the default Novu subscriber id is `NOVU_SUBSCRIBER_ID` or the same external id.

Device registration stores `device_token_hash` for identification and debugging. Raw device tokens are not returned in API responses and are not stored in this pass. Unregistering a device sets `revoked_at` instead of hard-deleting it, so revoked devices can be excluded from future push delivery.

Mobile Push is intentionally not implemented yet. This pass stops at backend foundations because real Push still requires provider credentials, a mobile shell, and device-token lifecycle verification.

Next steps for real Push:

1. Configure Novu for the real workflow and subscriber credentials.
2. Create a minimal mobile shell.
3. Get an Expo, FCM, or APNs device token.
4. Register the token through `/api/devices/register`.
5. Trigger a notification that routes toward Novu/Push.
6. Tap the push notification to open the Attn item.

## Slack Fan-Out

If `SLACK_WEBHOOK_URL` is set, `POST /api/notifications` sends a compact Slack message:

- `[Needs you] <title>`
- source / kind / priority
- summary
- Attn item link when `APP_BASE_URL` or `NEXT_PUBLIC_APP_BASE_URL` is set
- source URL when present

Slack failures do not fail notification creation. Attn records `slack_sent` or `slack_failed` in event history.

## Novu Seam

Novu is optional. If `NOVU_SECRET_KEY` and `NOVU_WORKFLOW_ID` are set, Attn makes a best-effort call to Novu's event trigger API and records `novu_sent` or `novu_failed`. The adapter receives the subscriber id, notification item id, title, summary, priority, item URL, and payload.

This is intentionally isolated in `lib/novu.ts`; the app works without Novu configured.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

Manual flow:

1. Apply the migration.
2. Run `npm run dev`.
3. Create a notification with the curl command above.
4. Confirm it appears in `/queue` under **Needs you**.
5. Open the detail page.
6. Acknowledge, snooze, resolve, and reopen it.
7. Confirm each action appears in event history.

## MVP Limitations

- No chat, channels, comments, reactions, or team collaboration.
- No multi-tenant billing or complex RBAC.
- No push notification setup.
- No full Novu workflow builder.
- Decision buttons record events only; they do not call back to an agent yet.
- Pagination is intentionally minimal; list endpoints cap `limit` at 250.
