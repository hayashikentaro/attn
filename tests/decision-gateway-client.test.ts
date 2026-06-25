import { describe, expect, it } from "vitest";
import {
  createWebSessionTicket,
  exchangePairingToken,
  postObservabilityEvent
} from "@/lib/decision-gateway/client";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    },
    ...init
  });
}

describe("decision-gateway client", () => {
  it("exchanges a pairing token with the configured gateway", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return jsonResponse({
        mobile_session: {
          session_token: "mobile_session_123",
          refresh_token: "refresh_123",
          issued_at: "2026-06-25T10:00:00.000Z",
          expires_at: "2026-07-25T10:00:00.000Z"
        }
      });
    };

    const result = await exchangePairingToken(
      {
        pairing_token: "pair_123",
        device_name: "iPhone",
        device_metadata: {}
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        apiToken: "gateway-api-token",
        fetchImpl
      }
    );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://decision-gateway.example.com/api/mobile/pairing/exchange"
    );
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer gateway-api-token",
        "Content-Type": "application/json"
      })
    );
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({
        pairing_token: "pair_123",
        device_name: "iPhone",
        device_metadata: {}
      })
    );
  });

  it("creates a web session ticket and validates the response", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          jsonResponse({
            web_session_url:
              "https://decision-gateway.example.com/mobile/session/ticket_123",
            expires_at: "2026-06-25T10:05:00.000Z"
          })
      }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        web_session_url:
          "https://decision-gateway.example.com/mobile/session/ticket_123",
        expires_at: "2026-06-25T10:05:00.000Z"
      }
    });
  });

  it("rejects open-session decision URLs outside the configured gateway origin", async () => {
    const calls: Array<RequestInfo | URL> = [];
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://attacker.example.com/decisions/dec_123"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async (input) => {
          calls.push(input);
          return jsonResponse({
            web_session_url:
              "https://decision-gateway.example.com/mobile/session/ticket_123",
            expires_at: "2026-06-25T10:05:00.000Z"
          });
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    if (!result.ok) {
      expect(result.error).toBe("invalid_request");
      expect(result.metadata.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "decision_url",
            message: "Decision URL must match gateway origin"
          })
        ])
      );
    }
  });

  it("rejects web session URLs outside the configured gateway origin", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          jsonResponse({
            web_session_url:
              "https://attacker.example.com/mobile/session/ticket_123",
            expires_at: "2026-06-25T10:05:00.000Z"
          })
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_response");
      expect(result.metadata.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "web_session_url",
            message: "Web session URL must match gateway origin"
          })
        ])
      );
    }
  });

  it("rejects open-session URLs with credential-like URL parameters", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url:
          "https://decision-gateway.example.com/decisions/dec_123?token=secret"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          jsonResponse({
            web_session_url:
              "https://decision-gateway.example.com/mobile/session/ticket_123",
            expires_at: "2026-06-25T10:05:00.000Z"
          })
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_request");
      expect(result.metadata.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "decision_url",
            message: expect.stringContaining(
              "URL must not include secret-like query or fragment keys"
            )
          })
        ])
      );
    }
  });

  it("rejects web session URLs with credential-like URL parameters", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          jsonResponse({
            web_session_url:
              "https://decision-gateway.example.com/mobile/session/ticket_123#session_token=secret",
            expires_at: "2026-06-25T10:05:00.000Z"
          })
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_response");
      expect(result.metadata.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "web_session_url",
            message: expect.stringContaining(
              "URL must not include secret-like query or fragment keys"
            )
          })
        ])
      );
    }
  });

  it("posts observability events and accepts empty success responses", async () => {
    const result = await postObservabilityEvent(
      {
        event: "notification_opened",
        occurred_at: "2026-06-25T10:00:00.000Z",
        decision_id: "dec_123",
        metadata: {
          route: "webview"
        }
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          new Response(null, {
            status: 204
          })
      }
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 204
      }
    });
  });

  it("fails safely when gateway config is missing", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      },
      {
        env: {
          NODE_ENV: "test"
        },
        fetchImpl: async () => {
          throw new Error("fetch should not be called");
        }
      }
    );

    expect(result).toEqual({
      ok: false,
      error: "not_configured",
      metadata: {
        code: "not_configured",
        message: "DECISION_GATEWAY_BASE_URL is not configured"
      }
    });
  });

  it("does not include request tokens in safe error metadata", async () => {
    const result = await exchangePairingToken(
      {
        pairing_token: "pair_secret_123",
        device_name: "iPhone",
        device_metadata: {}
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        apiToken: "gateway_api_secret",
        fetchImpl: async () => {
          throw new Error(
            "failed with pair_secret_123 and gateway_api_secret"
          );
        }
      }
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("pair_secret_123");
    expect(JSON.stringify(result)).not.toContain("gateway_api_secret");
    if (!result.ok) {
      expect(result.metadata.message).toBe(
        "failed with [redacted] and [redacted]"
      );
    }
  });

  it("returns safe HTTP failure metadata without response bodies", async () => {
    const result = await createWebSessionTicket(
      {
        mobile_session_token: "mobile_session_123",
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123"
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        fetchImpl: async () =>
          new Response("token leaked in body", {
            status: 401,
            statusText: "Unauthorized"
          })
      }
    );

    expect(result).toEqual({
      ok: false,
      error: "http_error",
      metadata: {
        code: "http_error",
        status: 401,
        statusText: "Unauthorized"
      }
    });
    expect(JSON.stringify(result)).not.toContain("token leaked in body");
  });

  it("times out gateway requests", async () => {
    const result = await postObservabilityEvent(
      {
        event: "webview_open_failed",
        occurred_at: "2026-06-25T10:00:00.000Z",
        metadata: {}
      },
      {
        baseUrl: "https://decision-gateway.example.com",
        timeoutMs: 1,
        fetchImpl: () =>
          new Promise<Response>(() => {
            // Intentionally unresolved to exercise client timeout behavior.
          })
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("request_failed");
      expect(result.metadata).toEqual(
        expect.objectContaining({
          code: "request_failed",
          name: "AbortError"
        })
      );
    }
  });
});
