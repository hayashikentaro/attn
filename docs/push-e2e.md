# Push E2E Runbook

This runbook is for the first real Push verification. It does not claim Push
works until the device, Novu, and provider steps have been completed with live
credentials.

## Prerequisites

- Attn backend deployed.
- Postgres database reachable from the backend.
- `DATABASE_URL`, `ATTN_INGEST_TOKEN`, `APP_BASE_URL`, and
  `NEXT_PUBLIC_APP_BASE_URL` configured on the backend.
- `EXPO_PUBLIC_ATTN_BACKEND_URL` configured in `mobile/`.
- Real iOS or Android device available.
- Novu and Expo/APNs/FCM credentials available for the live verification step.

Never put `ATTN_INGEST_TOKEN`, `DATABASE_URL`, `NOVU_SECRET_KEY`, or other
server-only secrets in Expo public environment variables.

## Backend Setup

1. Deploy the backend.
2. Run migrations from a trusted shell:

   ```bash
   DATABASE_URL="$DEPLOYED_DATABASE_URL" npm run migrate
   ```

3. Configure required backend env vars:

   ```env
   DATABASE_URL=
   ATTN_INGEST_TOKEN=
   APP_BASE_URL=
   NEXT_PUBLIC_APP_BASE_URL=
   ```

4. Configure optional integration env vars when ready:

   ```env
   SLACK_WEBHOOK_URL=
   NOVU_SECRET_KEY=
   NOVU_WORKFLOW_ID=
   NOVU_SUBSCRIBER_ID=
   NOVU_DRY_RUN=
   ```

5. Verify health:

   ```bash
   curl "$ATTN_BASE_URL/api/health"
   ```

6. Verify protected diagnostics:

   ```bash
   curl "$ATTN_BASE_URL/api/diagnostics" \
     -H "Authorization: Bearer $ATTN_INGEST_TOKEN"
   ```

7. Run smoke tests without real Push:

   ```bash
   ATTN_BASE_URL="$ATTN_BASE_URL" \
   ATTN_INGEST_TOKEN="$ATTN_INGEST_TOKEN" \
   npm run smoke:e2e
   ```

## Mobile Setup

1. Install mobile dependencies:

   ```bash
   cd mobile
   npm install
   ```

2. Configure a reachable backend URL:

   ```env
   EXPO_PUBLIC_ATTN_BACKEND_URL=https://your-attn.example.com
   EXPO_PUBLIC_ATTN_TEST_ITEM_URL=
   EXPO_PUBLIC_EXPO_PROJECT_ID=
   ```

3. Start Expo:

   ```bash
   npm run start
   ```

4. Open the mobile shell on a real device.
5. Request notification permission.

## Pair And Register Device

1. Create a pairing code from a trusted backend/admin shell:

   ```bash
   curl -X POST "$ATTN_BASE_URL/api/devices/pairing-codes" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
     -d '{ "expires_in_minutes": 10, "metadata": { "reason": "push e2e" } }'
   ```

2. Enter the returned `pairing_code` in the mobile app.
3. Tap **Pair device**.
4. Tap **Register device**.
5. Confirm an active device exists:

   ```bash
   curl "$ATTN_BASE_URL/api/diagnostics" \
     -H "Authorization: Bearer $ATTN_INGEST_TOKEN"
   ```

## Trigger Live Push

1. Configure Novu provider and workflow.
2. Ensure `NOVU_DRY_RUN` is unset or not `true`.
3. Trigger a high-priority decision item:

   ```bash
   curl -X POST "$ATTN_BASE_URL/api/notifications" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
     -d '{
       "source": "push-e2e",
       "kind": "decision_request",
       "priority": "high",
       "external_id": "push-e2e-001",
       "title": "Push E2E verification",
       "summary": "Tap the notification and confirm the Attn item opens."
     }'
   ```

4. Open the returned item detail and inspect delivery records.
5. Confirm the Novu delivery record is sent or failed with a safe error.
6. Receive Push on the device.
7. Tap Push.
8. Verify the Attn item detail opens.
9. Acknowledge or mark the item done.
10. Inspect event history and delivery state.

## Troubleshooting

401 on device register:
The mobile app must use the scoped registration token returned by
`/api/devices/pair`, not `ATTN_INGEST_TOKEN`. Pair again if the token expired.

Expired pairing code:
Create a new pairing code. Pairing codes default to a 10 minute expiry and are
single use.

Mobile cannot reach backend:
Use a deployed URL, LAN URL, or tunnel. A physical device usually cannot reach
`localhost` on the laptop.

No active devices:
Check `/api/diagnostics`. Re-pair and register the device. Confirm unregister
was not tapped after registration.

Novu skipped:
Check `NOVU_SECRET_KEY`, `NOVU_WORKFLOW_ID`, and `NOVU_DRY_RUN`. When Novu is
not configured, Attn records skipped delivery state by design.

Push not received:
Confirm the app has notification permission, the provider token was registered,
the Novu workflow/provider is configured, and the device is active. Inspect
delivery records before retrying.

Tap opens wrong URL:
Check that the Push payload includes `itemUrl`, or includes `notificationId`
that maps to `${EXPO_PUBLIC_ATTN_BACKEND_URL}/items/{notificationId}`.
