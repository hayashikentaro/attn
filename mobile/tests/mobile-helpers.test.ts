import { describe, expect, it } from "vitest";
import {
  buildPairDevicePayload,
  buildRegisterDevicePayload,
  buildUnregisterDevicePayload
} from "../src/api/attnClient";
import { normalizeBackendUrl } from "../src/lib/backend";
import { resolveItemUrlFromPayload } from "../src/lib/deepLinks";
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
      testItemUrl: "https://attn.example.com/items/test",
      expoProjectId: "expo-project"
    });
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
