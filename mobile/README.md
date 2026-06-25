# Attn Mobile Shell

This is a minimal Expo / React Native shell for future Push notification E2E testing.

It does:

- request notification permission on a real device;
- obtain an Expo push token when permission is granted;
- exchange a Gateway pairing token for a Gateway mobile session;
- store the Gateway mobile session in `expo-secure-store`;
- keep legacy Attn device registration available for diagnostics;
- open the Attn queue or a configured test item URL;
- prepare tap-to-open handling for future payloads containing `itemUrl` or `notificationId`.

It does not yet:

- prove real Push delivery works;
- verify Novu, Expo, APNs, or FCM credentials;
- implement the full Attn queue UI in native code;
- add chat, channels, comments, reactions, team management, or broad authentication.

## Configuration

Copy `env.example` to `.env` or set Expo public environment variables:

```env
EXPO_PUBLIC_ATTN_BACKEND_URL=http://localhost:3999
EXPO_PUBLIC_ATTN_TEST_ITEM_URL=
EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL=
EXPO_PUBLIC_EXPO_PROJECT_ID=
```

`EXPO_PUBLIC_ATTN_BACKEND_URL` must point to the deployed or local Attn backend. A physical device cannot reach `localhost` on your laptop; use a reachable LAN, tunnel, or deployed URL.

Do not place `ATTN_INGEST_TOKEN` or any server-wide secret in this app. Expo public variables are bundled into the client. This shell uses pairing codes and scoped registration tokens instead.

`EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL` points the mobile shell at the Decision Gateway origin for Gateway pairing. Do not put Gateway session tokens, API tokens, or one-time web-session tickets in Expo public variables.

`EXPO_PUBLIC_ATTN_TEST_ITEM_URL` is optional and only powers the "Open test item URL" button.

`EXPO_PUBLIC_EXPO_PROJECT_ID` may be needed by `expo-notifications` to obtain an Expo push token outside Expo Go defaults.

## Run

Install mobile dependencies when you are ready to run the Expo shell:

```bash
cd mobile
npm install
npm run start
```

Run on a real iOS or Android device for push-token testing. Simulators may not provide usable push tokens.

For first-device setup:

1. Start or deploy the Attn backend.
2. Apply backend migrations with `npm run migrate`.
3. Set `EXPO_PUBLIC_ATTN_BACKEND_URL` to a URL the device can reach.
4. Set `EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL` to the Decision Gateway origin.
5. From the repository root, run `npm run check:env -- --target=mobile --strict` in a shell where the mobile public variables are exported.
6. Run `npm run start`.
7. Open the Expo app on a real device.
8. Create a Gateway pairing token from a trusted Gateway context.
9. Enter the Gateway pairing token in the app and tap **Pair with Gateway**.
10. Tap **Request notification permission**.
11. Use legacy Attn pairing and device registration only if you are testing the current diagnostic push-token registration path.
12. Configure Novu and Expo/APNs/FCM credentials.
13. Trigger a high-priority notification.
14. Verify real Push receipt only after live credentials and a physical device are available.

## Gateway Pairing

Create a Gateway pairing token from a trusted Decision Gateway context. Attn mobile exchanges it with the configured Gateway origin and stores only the Gateway-issued mobile session in SecureStore.

The default exchange path in this repository is:

```text
/api/mobile/pairing/exchange
```

That path is a placeholder until the Decision Gateway API contract is confirmed. Keep it configurable in code and do not treat it as the production contract without Gateway confirmation.

The pairing request body is:

```json
{
  "pairing_token": "...",
  "device_name": "Attn mobile device",
  "device_metadata": {
    "app": "attn-mobile"
  }
}
```

The Gateway response must include a `mobile_session`. The app stores that session through `expo-secure-store`; token values are not displayed in the UI and pairing failures use generic messages.

## Legacy Attn Device Registration

The legacy Attn pairing and device registration path remains available for diagnostics while Gateway becomes the source of truth. It registers an Expo push token with Attn backend endpoints, but it is not the Gateway-owned decision session.

Create a legacy pairing code from a trusted backend/admin context:

```bash
curl -X POST http://localhost:3999/api/devices/pairing-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{ "expires_in_minutes": 10, "metadata": { "reason": "mobile setup" } }'
```

Enter the returned `pairing_code` in the legacy Attn pairing field. The app exchanges it with:

```json
{
  "pairing_code": "ABCD-EFGH",
  "device_name": "Attn mobile device",
  "metadata": {
    "app": "attn-mobile"
  }
}
```

The backend returns a scoped `registration_token`. The current diagnostic shell stores that token only in React state for register/unregister calls.

After legacy pairing, registration sends:

```json
{
  "platform": "expo",
  "provider": "expo",
  "device_token": "...",
  "device_name": "Attn mobile device",
  "metadata": {
    "app": "attn-mobile"
  }
}
```

Raw tokens are kept in memory only for register/unregister calls. The UI displays a redacted preview, and the backend response should expose only `device_token_hash`.

Register and unregister include:

```http
Authorization: Bearer <scoped device registration token>
```

The token is not `ATTN_INGEST_TOKEN` and cannot ingest notifications or create pairing codes.

Unregister sends the same scoped token plus:

```json
{
  "provider": "expo",
  "device_token": "..."
}
```

The backend marks the device revoked instead of deleting it.

## Tap-To-Open Payload

Future Push payloads should include:

```json
{
  "notificationId": "...",
  "itemUrl": "https://example.com/items/..."
}
```

The mobile shell prefers `itemUrl`. If it is missing, it builds `/items/{notificationId}` from the configured backend URL and opens it with the platform browser.

## Checks

This scaffold keeps pure helper tests independent from Expo runtime dependencies:

```bash
cd mobile
npm run typecheck
npm run test
```

The full Expo runtime path still needs `npm install` and a physical device for meaningful verification.

## Future Push E2E Checklist

1. Deploy Attn backend and configure the Decision Gateway origin.
2. Run backend migrations if legacy diagnostic registration is needed.
3. Configure `EXPO_PUBLIC_ATTN_BACKEND_URL`.
4. Configure `EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL`.
5. Run `npm run start`.
6. Open the Expo app on a real device.
7. Pair the Gateway session.
8. Tap **Request notification permission**.
9. Use legacy device registration only for diagnostic push-token testing.
10. Confirm diagnostic device count through `/api/diagnostics` when legacy registration is used.
11. Configure Novu and Expo/APNs/FCM credentials.
12. Trigger a high-priority notification.
13. Confirm delivery records in Attn or Gateway diagnostics as appropriate.
14. Receive Push.
15. Tap Push and open the Gateway decision page when WebView support lands.

Gateway pairing tokens are short-lived and must not be logged or stored after exchange. Legacy scoped registration tokens are only accepted by device register/unregister endpoints; they are not ingest/admin tokens.

Do not claim real Push works until live credentials, a real device, Push receipt, tap handling, and Gateway-owned decision execution have been verified.
