import { describe, expect, it } from "vitest";
import {
  buildPairDevicePayload,
  buildRegisterDevicePayload,
  buildUnregisterDevicePayload
} from "../src/api/attnClient";
import {
  buildGatewayPairingExchangePayload,
  exchangeGatewayPairingToken
} from "../src/api/gatewayClient";
import { normalizeBackendUrl } from "../src/lib/backend";
import { resolveItemUrlFromPayload } from "../src/lib/deepLinks";
import { parseGatewayNotificationPayload } from "../src/lib/gatewayPayload";
import {
  clearGatewayMobileSession,
  gatewayMobileSessionStorageKey,
  loadGatewayMobileSession,
  saveGatewayMobileSession,
  type GatewaySessionStorage
} from "../src/lib/gatewaySessionStorage";
import { getMobilePublicConfig } from "../src/lib/publicEnv";
import { redactToken, tokenHashPreview } from "../src/lib/tokens";

function createMemoryGatewaySessionStorage(): GatewaySessionStorage & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();

  return {
    values,
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    }
  };
}

describe("mobile helpers", () => {
  it("normalizes backend URLs", () => {
    expect(normalizeBackendUrl(" https://attn.example.com/ ")).toBe(
      "https://attn.example.com"
    );
    expect(normalizeBackendUrl("attn.example.com")).toBeNull();
    expect(normalizeBackendUrl("file:///tmp/attn")).toBeNull();
    expect(normalizeBackendUrl("")).toBeNull();
  });

  it("redacts push tokens and token hashes", () => {
    expect(redactToken("ExponentPushToken[abcdef1234567890]")).toBe(
      "Exponent...67890]"
    );
    expect(redactToken(null)).toBe("not available");
    expect(tokenHashPreview("0123456789abcdef0123456789abcdef")).toBe(
      "0123456789...89abcdef"
    );
  });

  it("maps notification payloads to item URLs", () => {
    expect(
      resolveItemUrlFromPayload(
        {
          itemUrl: "https://attn.example.com/items/direct",
          notificationId: "ignored"
        },
        "https://attn.example.com"
      )
    ).toBe("https://attn.example.com/items/direct");

    expect(
      resolveItemUrlFromPayload(
        {
          notificationId: "abc 123"
        },
        "https://attn.example.com/"
      )
    ).toBe("https://attn.example.com/items/abc%20123");

    expect(resolveItemUrlFromPayload({}, "https://attn.example.com")).toBeNull();
  });

  it("parses safe gateway notification payloads", () => {
    const parsed = parseGatewayNotificationPayload(
      {
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123",
        title: "Deployment approval",
        summary: "Production deploy is waiting for a decision.",
        urgency: "high",
        dedupe_key: "deploy:123",
        occurred_at: "2026-06-25T10:00:00.000Z"
      },
      "https://decision-gateway.example.com/"
    );

    expect(parsed).toEqual({
      ok: true,
      payload: {
        decision_id: "dec_123",
        decision_url: "https://decision-gateway.example.com/decisions/dec_123",
        title: "Deployment approval",
        summary: "Production deploy is waiting for a decision.",
        urgency: "high",
        dedupe_key: "deploy:123",
        occurred_at: "2026-06-25T10:00:00.000Z"
      }
    });
  });

  it("rejects gateway notification payloads outside the gateway origin", () => {
    expect(
      parseGatewayNotificationPayload(
        {
          decision_id: "dec_123",
          decision_url: "https://attacker.example.com/decisions/dec_123",
          title: "Deployment approval",
          summary: "Production deploy is waiting for a decision.",
          urgency: "high",
          dedupe_key: "deploy:123",
          occurred_at: "2026-06-25T10:00:00.000Z"
        },
        "https://decision-gateway.example.com"
      )
    ).toEqual({
      ok: false,
      reason: "wrong_origin"
    });
  });

  it("rejects gateway notification payloads with secret-like fields", () => {
    expect(
      parseGatewayNotificationPayload(
        {
          decision_id: "dec_123",
          decision_url: "https://decision-gateway.example.com/decisions/dec_123",
          title: "Deployment approval",
          summary: "Production deploy is waiting for a decision.",
          urgency: "high",
          dedupe_key: "deploy:123",
          occurred_at: "2026-06-25T10:00:00.000Z",
          mobile_session_token: "do-not-put-this-in-push"
        },
        "https://decision-gateway.example.com"
      )
    ).toEqual({
      ok: false,
      reason: "secret_like_payload"
    });
  });

  it("rejects gateway notification URLs with secret-like query or fragment keys", () => {
    for (const decisionUrl of [
      "https://decision-gateway.example.com/decisions/dec_123?token=secret",
      "https://decision-gateway.example.com/decisions/dec_123#refresh_token=secret",
      "https://decision-gateway.example.com/decisions/dec_123#/return?api_key=secret"
    ]) {
      expect(
        parseGatewayNotificationPayload(
          {
            decision_id: "dec_123",
            decision_url: decisionUrl,
            title: "Deployment approval",
            summary: "Production deploy is waiting for a decision.",
            urgency: "high",
            dedupe_key: "deploy:123",
            occurred_at: "2026-06-25T10:00:00.000Z"
          },
          "https://decision-gateway.example.com"
        )
      ).toEqual({
        ok: false,
        reason: "secret_like_url"
      });
    }
  });

  it("builds pairing and device payloads without server ingest tokens", () => {
    expect(
      buildPairDevicePayload({
        pairingCode: "ABCD-EFGH",
        deviceName: "iPhone",
        metadata: {
          runtime: "expo-go"
        }
      })
    ).toEqual({
      pairing_code: "ABCD-EFGH",
      device_name: "iPhone",
      metadata: {
        app: "attn-mobile",
        runtime: "expo-go"
      }
    });

    expect(
      buildRegisterDevicePayload({
        deviceToken: "ExponentPushToken[secret]",
        registrationToken: "attn_drt_registration_secret",
        deviceName: "iPhone",
        metadata: {
          runtime: "expo-go"
        }
      })
    ).toEqual({
      platform: "expo",
      provider: "expo",
      device_token: "ExponentPushToken[secret]",
      device_name: "iPhone",
      metadata: {
        app: "attn-mobile",
        runtime: "expo-go"
      }
    });

    expect(buildUnregisterDevicePayload("ExponentPushToken[secret]")).toEqual({
      provider: "expo",
      device_token: "ExponentPushToken[secret]"
    });
  });

  it("builds public mobile config without reading the server ingest token", () => {
    const env = {
      EXPO_PUBLIC_ATTN_BACKEND_URL: "https://attn.example.com",
      EXPO_PUBLIC_ATTN_TEST_ITEM_URL: "https://attn.example.com/items/test",
      EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL:
        "https://decision-gateway.example.com/",
      EXPO_PUBLIC_EXPO_PROJECT_ID: "expo-project",
      ATTN_INGEST_TOKEN: "server-secret"
    };

    expect(
      getMobilePublicConfig(
        env,
        {
          attnBackendUrl: "https://fallback.example.com"
        }
      )
    ).toEqual({
      backendUrl: "https://attn.example.com",
      gatewayBaseUrl: "https://decision-gateway.example.com",
      testItemUrl: "https://attn.example.com/items/test",
      expoProjectId: "expo-project"
    });
  });

  it("builds gateway pairing payloads without Attn server tokens", () => {
    expect(
      buildGatewayPairingExchangePayload({
        pairingToken: "gateway_pairing_secret",
        deviceName: "iPhone",
        metadata: {
          runtime: "expo-go"
        }
      })
    ).toEqual({
      pairing_token: "gateway_pairing_secret",
      device_name: "iPhone",
      device_metadata: {
        app: "attn-mobile",
        runtime: "expo-go"
      }
    });
  });

  it("exchanges gateway pairing tokens with a configurable path", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];

    const result = await exchangeGatewayPairingToken(
      {
        gatewayBaseUrl: "https://decision-gateway.example.com"
      },
      {
        pairingToken: "gateway_pairing_secret",
        deviceName: "iPhone",
        pairingExchangePath: "/custom/pairing/exchange",
        fetchImpl: async (input, init) => {
          calls.push({ input, init });
          return new Response(
            JSON.stringify({
              mobile_session: {
                session_token: "mobile_session_secret",
                refresh_token: "refresh_secret",
                expires_at: "2026-07-25T10:00:00.000Z",
                gateway_origin: "https://decision-gateway.example.com"
              },
              gateway_origin: "https://decision-gateway.example.com"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          );
        }
      }
    );

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "https://decision-gateway.example.com/custom/pairing/exchange"
    );
    expect(calls[0]?.init?.headers).toEqual({
      "Content-Type": "application/json"
    });
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({
        pairing_token: "gateway_pairing_secret",
        device_name: "iPhone",
        device_metadata: {
          app: "attn-mobile"
        }
      })
    );
    expect(result).toEqual({
      mobile_session: {
        session_token: "mobile_session_secret",
        refresh_token: "refresh_secret",
        expires_at: "2026-07-25T10:00:00.000Z",
        gateway_origin: "https://decision-gateway.example.com"
      },
      gateway_origin: "https://decision-gateway.example.com"
    });
  });

  it("returns safe gateway pairing errors without token values", async () => {
    await expect(
      exchangeGatewayPairingToken(
        {
          gatewayBaseUrl: null
        },
        {
          pairingToken: "gateway_pairing_secret"
        }
      )
    ).rejects.toThrow("Decision Gateway URL is not configured.");

    await expect(
      exchangeGatewayPairingToken(
        {
          gatewayBaseUrl: "https://decision-gateway.example.com"
        },
        {
          pairingToken: "gateway_pairing_secret",
          fetchImpl: async () =>
            new Response("gateway_pairing_secret", {
              status: 401,
              statusText: "Unauthorized"
            })
        }
      )
    ).rejects.toThrow("Unable to exchange gateway pairing token.");

    await expect(
      exchangeGatewayPairingToken(
        {
          gatewayBaseUrl: "https://decision-gateway.example.com"
        },
        {
          pairingToken: "gateway_pairing_secret",
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                mobile_session: {
                  refresh_token: "refresh_without_session"
                }
              }),
              {
                status: 200,
                headers: {
                  "content-type": "application/json"
                }
              }
            )
        }
      )
    ).rejects.toThrow("Gateway pairing response was invalid.");
  });

  it("saves, loads, and clears gateway mobile sessions through storage", async () => {
    const storage = createMemoryGatewaySessionStorage();

    await saveGatewayMobileSession(
      {
        session_token: "mobile_session_secret",
        refresh_token: "refresh_secret",
        expires_at: "2026-07-25T10:00:00.000Z",
        gateway_origin: "https://decision-gateway.example.com",
        subject_label: "Mobile user"
      },
      storage
    );

    expect(storage.values.has(gatewayMobileSessionStorageKey)).toBe(true);
    await expect(loadGatewayMobileSession(storage)).resolves.toEqual({
      session_token: "mobile_session_secret",
      refresh_token: "refresh_secret",
      expires_at: "2026-07-25T10:00:00.000Z",
      gateway_origin: "https://decision-gateway.example.com",
      subject_label: "Mobile user"
    });

    await clearGatewayMobileSession(storage);

    expect(storage.values.has(gatewayMobileSessionStorageKey)).toBe(false);
    await expect(loadGatewayMobileSession(storage)).resolves.toBeNull();
  });

  it("loads null for missing, malformed, or tokenless gateway sessions", async () => {
    const storage = createMemoryGatewaySessionStorage();

    await expect(loadGatewayMobileSession(storage)).resolves.toBeNull();

    storage.values.set(gatewayMobileSessionStorageKey, "{");
    await expect(loadGatewayMobileSession(storage)).resolves.toBeNull();

    storage.values.set(
      gatewayMobileSessionStorageKey,
      JSON.stringify({
        refresh_token: "refresh_without_session"
      })
    );
    await expect(loadGatewayMobileSession(storage)).resolves.toBeNull();
  });

  it("does not leak gateway token values in invalid session errors", async () => {
    const storage = createMemoryGatewaySessionStorage();

    await expect(
      saveGatewayMobileSession(
        {
          session_token: ""
        },
        storage
      )
    ).rejects.toThrow("Invalid gateway mobile session");

    await expect(
      saveGatewayMobileSession(
        {
          session_token: "mobile_session_secret"
        },
        storage
      )
    ).resolves.toBeUndefined();
  });
});
