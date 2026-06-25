import { describe, expect, it } from "vitest";
import {
  createGatewayNotificationPayloadSchema,
  findGatewaySecretLikeKeys,
  gatewayNotificationPayloadSchema,
  gatewayObservabilityEventSchema,
  gatewayOpenSessionRequestSchema,
  gatewayOpenSessionResponseSchema,
  gatewayPairingExchangeRequestSchema,
  gatewayPairingExchangeResponseSchema
} from "@/lib/decision-gateway/types";

const validNotificationPayload = {
  decision_id: "dec_123",
  decision_url: "https://decision-gateway.example.com/decisions/dec_123",
  title: "Deployment approval",
  summary: "Production deploy is waiting for a decision.",
  urgency: "high",
  dedupe_key: "deploy:123",
  occurred_at: "2026-06-25T10:00:00.000Z"
};

describe("decision-gateway contract types", () => {
  it("accepts the safe Novu notification payload contract", () => {
    const parsed =
      gatewayNotificationPayloadSchema.safeParse(validNotificationPayload);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.decision_id).toBe("dec_123");
      expect(parsed.data.decision_url).toBe(
        "https://decision-gateway.example.com/decisions/dec_123"
      );
    }
  });

  it("rejects incomplete notification payloads cleanly", () => {
    const parsed = gatewayNotificationPayloadSchema.safeParse({
      decision_url: "https://decision-gateway.example.com/decisions/dec_123",
      title: "Deployment approval",
      summary: "Production deploy is waiting for a decision.",
      dedupe_key: "deploy:123"
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["decision_id"],
            message: "Provide either decision_id or task_id"
          }),
          expect.objectContaining({
            path: ["urgency"],
            message: "Provide either urgency or priority"
          }),
          expect.objectContaining({
            path: ["created_at"],
            message: "Provide either created_at or occurred_at"
          })
        ])
      );
    }
  });

  it("rejects notification payloads that contain token or secret fields", () => {
    const parsed = gatewayNotificationPayloadSchema.safeParse({
      ...validNotificationPayload,
      mobile_session_token: "do-not-put-this-in-push"
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "unrecognized_keys",
            keys: ["mobile_session_token"]
          })
        ])
      );
    }
  });

  it("can constrain notification decision URLs to the gateway origin", () => {
    const schema = createGatewayNotificationPayloadSchema({
      gatewayOrigin: "https://decision-gateway.example.com"
    });

    expect(schema.safeParse(validNotificationPayload).success).toBe(true);

    const parsed = schema.safeParse({
      ...validNotificationPayload,
      decision_url: "https://attacker.example.com/decisions/dec_123"
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["decision_url"],
            message: "Decision URL must match gateway origin"
          })
        ])
      );
    }
  });

  it("defines pairing, mobile session, and open-session contracts", () => {
    expect(
      gatewayPairingExchangeRequestSchema.safeParse({
        pairing_token: "pair_123",
        device_name: "iPhone",
        device_metadata: {
          app: "Attn"
        }
      }).success
    ).toBe(true);

    expect(
      gatewayPairingExchangeResponseSchema.safeParse({
        mobile_session: {
          session_token: "mobile_session_123",
          refresh_token: "refresh_123",
          issued_at: "2026-06-25T10:00:00.000Z",
          expires_at: "2026-07-25T10:00:00.000Z",
          gateway_origin: "https://decision-gateway.example.com"
        }
      }).success
    ).toBe(true);

    expect(
      gatewayOpenSessionRequestSchema.safeParse({
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      }).success
    ).toBe(true);

    expect(
      gatewayOpenSessionResponseSchema.safeParse({
        web_session_url:
          "https://decision-gateway.example.com/mobile/session/ticket_123",
        expires_at: "2026-06-25T10:05:00.000Z"
      }).success
    ).toBe(true);
  });

  it("constrains observability events and rejects secret metadata", () => {
    expect(
      gatewayObservabilityEventSchema.safeParse({
        event: "notification_opened",
        occurred_at: "2026-06-25T10:00:00.000Z",
        decision_id: "dec_123",
        metadata: {
          route: "webview"
        }
      }).success
    ).toBe(true);

    const invalidEvent = gatewayObservabilityEventSchema.safeParse({
      event: "decision_approved",
      occurred_at: "2026-06-25T10:00:00.000Z"
    });
    expect(invalidEvent.success).toBe(false);

    const secretMetadata = gatewayObservabilityEventSchema.safeParse({
      event: "webview_open_failed",
      occurred_at: "2026-06-25T10:00:00.000Z",
      metadata: {
        nested: {
          refresh_token: "do-not-log"
        }
      }
    });
    expect(secretMetadata.success).toBe(false);
  });

  it("finds nested secret-like keys for diagnostics redaction checks", () => {
    expect(
      findGatewaySecretLikeKeys({
        visible: true,
        nested: [{ api_key: "secret" }, { safe: "value" }]
      })
    ).toEqual([["nested", 0, "api_key"]]);
  });
});
