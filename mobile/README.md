# Attn Mobile Shell

This is a minimal Expo / React Native shell for future Push notification E2E testing.

It does:

- request notification permission on a real device;
- obtain an Expo push token when permission is granted;
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
EXPO_PUBLIC_ATTN_DEFAULT_SUBSCRIBER_ID=
EXPO_PUBLIC_ATTN_TEST_ITEM_URL=
EXPO_PUBLIC_EXPO_PROJECT_ID=
```

`EXPO_PUBLIC_ATTN_BACKEND_URL` must point to the deployed or local Attn backend. A physical device cannot reach `localhost` on your laptop; use a reachable LAN, tunnel, or deployed URL.

`EXPO_PUBLIC_ATTN_DEFAULT_SUBSCRIBER_ID` is optional. If omitted, the backend uses its default subscriber strategy.

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

## Device Registration

The app sends this backend-compatible payload:

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

Unregister sends:

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
2. Configure backend URL in the mobile app.
3. Run mobile app on a real device.
4. Request notification permission.
5. Register device.
6. Confirm the device row in the backend.
7. Configure Novu and Expo/APNs/FCM credentials.
8. Trigger a high-priority decision item.
9. Receive Push.
10. Tap Push and open the Attn item.

Do not claim real Push works until steps 7-10 have been verified with live credentials and a real device.
