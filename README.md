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
npm run migrate
```

Start the app:

```bash
npm run dev
```

Open `http://localhost:3999/queue`.

The minimal future-Push mobile shell lives in `mobile/`. It is isolated from the web app and documented in `mobile/README.md`.

For deployed environments, run the same command from a trusted shell that has
`DATABASE_URL` pointed at the deployed database. The migration script applies
the SQL files in `supabase/migrations/` with `psql`; it does not reset data.

## Environment Variables

Server-only secrets:

```env
DATABASE_URL=
ATTN_INGEST_TOKEN=
```

Server/public URL:

```env
APP_BASE_URL=
NEXT_PUBLIC_APP_BASE_URL=
```

Optional server integrations:

```env
SLACK_WEBHOOK_URL=
NOVU_SECRET_KEY=
NOVU_WORKFLOW_ID=
NOVU_DRY_RUN=
NOVU_SUBSCRIBER_ID=
ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID=
```

Mobile public variables, configured under `mobile/`:

```env
EXPO_PUBLIC_ATTN_BACKEND_URL=
EXPO_PUBLIC_ATTN_TEST_ITEM_URL=
EXPO_PUBLIC_EXPO_PROJECT_ID=
```

Only `DATABASE_URL` is required for core local functionality.

If `ATTN_INGEST_TOKEN` is set, ingestion requires either:

- `Authorization: Bearer <token>`
- `x-attn-token: <token>`

If `ATTN_INGEST_TOKEN` is not set, ingestion is open for local development.

Do not put `ATTN_INGEST_TOKEN` in the mobile app or any `EXPO_PUBLIC_*`
variable. Expo public variables are bundled into the client. Mobile device
registration uses short-lived pairing codes and scoped device registration
tokens instead.

Set `NOVU_DRY_RUN=true` when you want deterministic delivery bookkeeping
without calling Novu, even if Novu credentials are present.

Check deployment-readiness env grouping without printing secret values:

```bash
npm run check:env
```

For a backend deploy guard from a shell that has the deploy env loaded:

```bash
npm run check:env -- --target=web --strict
```

For mobile public config:

```bash
npm run check:env -- --target=mobile --strict
```

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

Diagnostics check. This is protected by `ATTN_INGEST_TOKEN` and only reports
safe booleans/counts:

```bash
curl http://localhost:3999/api/diagnostics \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN"
```

Create a short-lived device pairing code. This is an admin/server action and
requires `ATTN_INGEST_TOKEN`:

```bash
curl -X POST http://localhost:3999/api/devices/pairing-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{
    "expires_in_minutes": 10,
    "metadata": {
      "reason": "mobile setup"
    }
  }'
```

Exchange the pairing code from the mobile app or a test client:

```bash
curl -X POST http://localhost:3999/api/devices/pair \
  -H "Content-Type: application/json" \
  -d '{
    "pairing_code": "ABCD-EFGH",
    "device_name": "iPhone",
    "metadata": {
      "app": "attn-mobile"
    }
  }'
```

Register a future Push device using the scoped registration token returned by
the pairing exchange:

```bash
curl -X POST http://localhost:3999/api/devices/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_DEVICE_REGISTRATION_TOKEN" \
  -d '{
    "platform": "expo",
    "provider": "expo",
    "device_token": "ExponentPushToken[...]",
    "device_name": "iPhone",
    "metadata": {}
  }'
```

Unregister with the same scoped registration token:

```bash
curl -X POST http://localhost:3999/api/devices/unregister \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_DEVICE_REGISTRATION_TOKEN" \
  -d '{
    "provider": "expo",
    "device_token": "ExponentPushToken[...]"
  }'
```

Trusted server-side/manual tooling may use `x-attn-token: $ATTN_INGEST_TOKEN`
for device register/unregister when `ATTN_INGEST_TOKEN` is configured. Mobile
clients should not use that path.

## API

- `GET /api/health` returns app status and database connectivity without exposing secrets.
- `GET /api/diagnostics` returns protected, safe deployment diagnostics without exposing secrets.
- `POST /api/notifications` creates a notification and records `created`.
- `GET /api/notifications?bucket=needs_you` lists notifications. Buckets: `needs_you`, `later`, `done`, `all`.
- `GET /api/notifications/[id]` returns one notification with event history.
- `POST /api/notifications/[id]/acknowledge` marks acknowledged.
- `POST /api/notifications/[id]/snooze` accepts `{ "until": "..." }` or `{ "minutes": 60 }`.
- `POST /api/notifications/[id]/resolve` marks done.
- `POST /api/notifications/[id]/reopen` moves the item back to new.
- `POST /api/notifications/[id]/decision` records `decision:<value>` for checkpoint-style items.
- `POST /api/devices/pairing-codes` creates a short-lived pairing code. It is protected by `ATTN_INGEST_TOKEN` and returns the raw code only once.
- `POST /api/devices/pair` exchanges a pairing code for a scoped device registration token.
- `POST /api/devices/register` creates or updates a future Push device record using the scoped registration token. Raw device tokens are accepted by the API but are not returned.
- `POST /api/devices/unregister` revokes a device by id or by provider plus device token using the scoped registration token.

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

When a high/critical/checkpoint route wants Slack or Novu but the provider is not configured, Attn records a skipped delivery row with a reason such as `slack_not_configured` or `novu_not_configured`. Delivery rows track `channel`, `provider`, `status`, `attempts`, `last_error`, `sent_at`, timestamps, and non-secret metadata. The item detail API and page expose these fields for debugging without making the queue noisy. Slack and Novu failures do not fail notification creation; Attn stores the notification, records the failed delivery state, and keeps the item in the queue.

## Subscribers And Devices

Attn now has a minimal subscriber and device-token foundation for the future mobile app.

If an incoming device registration does not specify `subscriber_id`, Attn uses a default subscriber. The default external id is `ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID` or `attn-operator`; the default Novu subscriber id is `NOVU_SUBSCRIBER_ID` or the same external id.

Mobile device registration starts with a pairing code. The backend stores only `code_hash`, then exchanges a valid, unused, unexpired code for a short-lived scoped device registration token. That token is only accepted by device register/unregister endpoints; it is not an ingest token and does not allow admin actions.

Device registration stores `device_token_hash` for identification and debugging. Raw device tokens are not returned in API responses and are not stored in this pass. Unregistering a device sets `revoked_at` instead of hard-deleting it, so revoked devices can be excluded from future push delivery.

Mobile Push is intentionally not implemented yet. This pass stops at backend foundations because real Push still requires provider credentials, a mobile shell, and device-token lifecycle verification.

The `mobile/` Expo shell now covers the mobile-side foundation: permission request, Expo push token acquisition path, device registration/unregistration calls, queue/test-item opening, and future tap-to-open payload handling. It does not prove real Push delivery.

Next steps for real Push:

1. Configure Novu for the real workflow and subscriber credentials.
2. Configure `EXPO_PUBLIC_ATTN_BACKEND_URL` in `mobile/`.
3. Run the mobile shell on a real device.
4. Create a pairing code from the backend.
5. Pair the mobile app and receive a scoped registration token.
6. Get an Expo, FCM, or APNs device token.
7. Register the token through `/api/devices/register`.
8. Trigger a notification that routes toward Novu/Push.
9. Tap the push notification to open the Attn item.

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

If `NOVU_DRY_RUN=true`, Attn does not call Novu. It records a skipped delivery
with dry-run metadata so routing and smoke tests stay deterministic.

This is intentionally isolated in `lib/novu.ts`; the app works without Novu configured.

## Deployment Smoke Tests

The local smoke script verifies the core backend flow without real external
services or Push credentials. It requires a running app, migrated database, and
an ingest/admin token:

```bash
ATTN_BASE_URL=http://localhost:3999 \
ATTN_INGEST_TOKEN=dev-token \
npm run smoke:e2e
```

The script checks:

- `GET /api/health`
- idempotent ingest with `external_id` and `duplicated: true`
- pairing code creation and exchange
- fake Expo token registration/unregistration
- high-priority delivery bookkeeping
- protected diagnostics

Use fake tokens only, such as `ExponentPushToken[fake-smoke-token]`. The smoke
script does not send real Push and does not require Novu, Expo, APNs, or FCM.

Print the first-deploy sequence and a safe env readiness summary:

```bash
npm run deploy:checklist
```

For the first live Push verification runbook, see `docs/push-e2e.md`.

## Verification

Run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
git diff --check
```

Mobile helper checks:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run test
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
