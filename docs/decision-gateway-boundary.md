# Decision Gateway Boundary

Attn is the iOS notification entry point for the existing decision-gateway system. It is not an independent decision system.

## Core Identity

decision-gateway is the source of truth for decisions, authentication, authorization, canonical state, business rules, callbacks, and decision execution.

Attn owns iOS push receipt, secure mobile session storage, local diagnostics, and an in-app WebView shell that opens decision-gateway pages.

Attn must not duplicate gateway-owned decision UI, decision state, user management, team management, permission checks, or business logic.

## Current Slack Path

```text
decision-gateway/Vercel
  -> Slack notification
  -> link
  -> browser opens gateway decision page
  -> QR/token auth
  -> decision in gateway
```

## Target Attn Path

```text
decision-gateway/Vercel
  -> Novu notification
  -> iOS push
  -> Attn receives notification
  -> Attn opens gateway decision page inside app WebView
  -> gateway auth/session
  -> decision in gateway
```

## Ownership Matrix

| Area | Owner | Boundary |
| --- | --- | --- |
| Decisions | decision-gateway | Gateway stores canonical decision records, status, transitions, and audit history. |
| Authentication | decision-gateway | Gateway owns user identity, pairing validation, session issuance, refresh, and revocation. |
| Users and teams | decision-gateway | Attn does not model users, teams, roles, or membership as canonical state. |
| Permissions | decision-gateway | Gateway decides whether a mobile session may view or act on a decision. |
| Business logic | decision-gateway | Approval, rejection, callbacks, routing, and domain rules remain gateway-owned. |
| Notification dispatch | decision-gateway and Novu | Gateway chooses what to notify; Novu transports the push payload. |
| iOS notification receipt | Attn | Attn receives push notifications and maps safe payloads to local navigation intent. |
| QR pairing UI | Attn | Attn may scan or accept a pairing code, then exchanges it with gateway. |
| Token storage | Attn | Attn stores gateway-issued mobile credentials in iOS Keychain or equivalent secure storage. |
| WebView shell | Attn | Attn opens gateway-hosted decision pages and does not recreate decision controls natively. |
| Local diagnostics | Attn | Attn may report operational events, but they are not canonical decision state. |

The existing Attn notification queue is legacy/MVP infrastructure. It may remain for smoke tests or diagnostics, but it must not become the source of truth for decisions or a second approval system.

## Contracts

### 1. Novu Notification Payload

The Novu payload sent to Attn must contain only safe routing and display metadata:

- `decision_id` or `task_id`
- `decision_url`
- `title`
- `summary`
- `urgency` or `priority`
- `dedupe_key`
- `created_at` or `occurred_at`

The payload must not include long-lived tokens, refresh tokens, gateway API tokens, `ATTN_INGEST_TOKEN`, user secrets, team secrets, or any credential usable outside a short-lived notification context.

Attn should reject or ignore payloads with obvious secret/token fields, malformed URLs, missing decision identifiers, or URLs outside the configured gateway origin.

### 2. QR Pairing And Mobile Session

Gateway owns pairing and authentication.

Attn may scan a QR code or accept a pairing code, then send that pairing token to gateway. Gateway validates the token and returns a mobile session token or refreshable mobile credential.

Attn stores the returned mobile credential in iOS Keychain or an equivalent secure storage mechanism. Attn does not create canonical user, team, auth, or permission state from the pairing response.

Pairing errors shown in Attn must be user-readable and must not leak token values.

### 3. WebView Open Session

Before opening a protected decision page, Attn requests a short-lived web session ticket from gateway using the stored mobile session token.

Gateway returns a one-time URL or ticket. Attn opens that URL in a WebView. Gateway sets an HttpOnly cookie or equivalent browser session and redirects to the requested `decision_url`.

Decision execution remains gateway-owned. Attn does not embed approval or rejection actions in native UI unless gateway explicitly delegates a future native contract.

Visible URLs must not contain long-lived credentials. Any ticket in a URL must be short-lived, one-time, and gateway-issued.

### 4. Observability

Attn may report diagnostic events such as:

- `notification_received`
- `notification_opened`
- `webview_open_failed`
- `session_refresh_failed`
- `token_missing`
- `pairing_completed`

These events are operational diagnostics only. They are not source-of-truth decision state and must not be used to infer final approval, rejection, cancellation, or permission outcomes.

Logs must redact tokens, pairing codes, full credential-bearing URLs, and payload fields that look like secrets.

## Secret And Environment Rules

Attn must not put gateway tokens, `ATTN_INGEST_TOKEN`, Novu secrets, or backend API tokens in Novu payloads or Expo public environment variables.

Mobile/public environment may contain only safe configuration such as a gateway base URL, and even that URL must be validated before WebView navigation.

Server-only values such as `DECISION_GATEWAY_API_TOKEN` must stay server-only. They must not be bundled into mobile code or logged.

## Non-Goals

- Build a second approval system in Attn.
- Add team, user, role, or permission management to Attn.
- Make Attn notification records canonical decision state.
- Execute approve, reject, or callback logic in Attn.
- Store raw push tokens beyond what is required for push delivery diagnostics and device registration.
- Claim real Novu or APNs delivery works without physical iOS device verification.
- Edit the `decision-gateway` repository as part of Attn changes.

## Migration Phases

1. Documentation and boundary lock: define this boundary, ownership matrix, payload contract, pairing contract, WebView contract, observability contract, and secret rules.
2. Gateway contract types: add TypeScript interfaces and validation for safe notification payloads, pairing exchange, mobile sessions, open-session tickets, and observability events.
3. Gateway client adapter: add a gateway API adapter with safe environment handling, fetch mocks in tests, timeout behavior, and redacted errors.
4. Mobile auth storage boundary: add secure storage for gateway mobile sessions, preferring Keychain/SecureStore over AsyncStorage.
5. QR pairing UI: implement scan or paste flow that exchanges a gateway pairing token and stores only the gateway-issued mobile credential.
6. Novu push payload handling: map safe gateway payloads into pending navigation, preserving decision intent when pairing is required.
7. In-app browser/WebView: request a gateway web session ticket and open the gateway-hosted decision page inside Attn with origin constraints.
8. De-emphasize duplicate Attn backend paths: review existing notification and decision APIs before removal; keep only health, diagnostics, or smoke-test paths unless explicitly approved.
9. End-to-end dry run: use mocked or local gateway responses to test pairing, payload receipt, web session ticket creation, WebView target opening, and observability.
10. Real device and live services: after contracts and dry run pass, configure Novu from gateway and verify push receipt, tap handling, in-app gateway page open, and gateway-owned decision execution on a physical iOS device.
