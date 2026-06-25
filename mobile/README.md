# Attn Mobile Shell

This is a minimal Expo / React Native shell for future Push notification E2E testing.

It does:

- request notification permission on a real device;
- obtain an Expo push token when permission is granted;
- exchange a short-lived pairing code for a scoped registration token;
- register the token with `POST /api/devices/register`;
- unregister the token with `POST /api/devices/unregister`;
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
EXPO_PUBLIC_EXPO_PROJECT_ID=
```

`EXPO_PUBLIC_ATTN_BACKEND_URL` must point to the deployed or local Attn backend. A physical device cannot reach `localhost` on your laptop; use a reachable LAN, tunnel, or deployed URL.

Do not place `ATTN_INGEST_TOKEN` or any server-wide secret in this app. Expo public variables are bundled into the client. This shell uses pairing codes and scoped registration tokens instead.

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
4. From the repository root, run `npm run check:env -- --target=mobile --strict` in a shell where `EXPO_PUBLIC_ATTN_BACKEND_URL` is exported.
5. Run `npm run start`.
6. Open the Expo app on a real device.
7. Create a pairing code from a trusted backend/admin shell.
8. Enter the pairing code in the app and tap **Pair device**.
9. Tap **Request notification permission**.
10. Tap **Register device**.
11. Confirm the device count through `/api/diagnostics`.
12. Configure Novu and Expo/APNs/FCM credentials.
13. Trigger a high-priority notification.
14. Verify real Push receipt only after live credentials and a physical device are available.

## Pairing And Device Registration

Create a pairing code from a trusted backend/admin context:

```bash
curl -X POST http://localhost:3999/api/devices/pairing-codes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ATTN_INGEST_TOKEN" \
  -d '{ "expires_in_minutes": 10, "metadata": { "reason": "mobile setup" } }'
```

Enter the returned `pairing_code` in the mobile app and tap **Pair device**. The app exchanges it with:

```json
{
  "pairing_code": "ABCD-EFGH",
  "device_name": "Attn mobile device",
  "metadata": {
    "app": "attn-mobile"
  }
}
```

The backend returns a scoped `registration_token`. This shell stores it only in React state for now; closing the app loses it. That is acceptable for the current test shell and should be replaced with secure local storage before production use.

After pairing, registration sends:

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

1. Deploy Attn backend.
2. Run backend migrations.
3. Configure `EXPO_PUBLIC_ATTN_BACKEND_URL`.
4. Run mobile app on a real device.
5. Request notification permission.
6. Create a pairing code from a trusted backend/admin context.
7. Pair the mobile app.
8. Register device.
9. Confirm active device count in diagnostics.
10. Configure Novu and Expo/APNs/FCM credentials.
11. Trigger a high-priority decision item.
12. Confirm delivery records in Attn.
13. Receive Push.
14. Tap Push and open the Attn item.

Pairing codes are short-lived. Scoped registration tokens are only accepted by
device register/unregister endpoints; they are not ingest/admin tokens.

Do not claim real Push works until steps 10-14 have been verified with live credentials and a real device.
