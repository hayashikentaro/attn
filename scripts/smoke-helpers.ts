export const fakeExpoToken = "ExponentPushToken[fake-smoke-token]";

export function requireSmokeConfig(env = process.env) {
  const baseUrl = env.ATTN_BASE_URL;
  const ingestToken = env.ATTN_INGEST_TOKEN;

  if (!baseUrl || !ingestToken) {
    throw new Error("ATTN_BASE_URL and ATTN_INGEST_TOKEN are required.");
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    ingestToken
  };
}

export function buildSmokeNotificationPayload(id: string, priority = "normal") {
  return {
    source: "smoke",
    kind: priority === "high" ? "decision_request" : "info",
    priority,
    external_id: id,
    dedupe_key: `smoke:${id}`,
    schema_version: "1",
    title: `Smoke notification ${id}`,
    summary: "Local smoke verification item.",
    payload_json: {
      smoke: true
    }
  };
}

export function buildPairingCodePayload() {
  return {
    expires_in_minutes: 10,
    metadata: {
      source: "smoke:e2e"
    }
  };
}

export function buildPairPayload(pairingCode: string) {
  return {
    pairing_code: pairingCode,
    device_name: "Smoke test device",
    metadata: {
      source: "smoke:e2e"
    }
  };
}

export function buildRegisterDevicePayload() {
  return {
    platform: "expo",
    provider: "expo",
    device_token: fakeExpoToken,
    device_name: "Smoke test device",
    metadata: {
      source: "smoke:e2e"
    }
  };
}

export function buildUnregisterDevicePayload() {
  return {
    provider: "expo",
    device_token: fakeExpoToken
  };
}

export function redactSmokeValue(value: string) {
  if (value.length <= 12) {
    return "***";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
