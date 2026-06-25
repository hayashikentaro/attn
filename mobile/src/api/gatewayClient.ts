import { joinBackendPath } from "../lib/backend";
import type { GatewayMobileSession } from "../lib/gatewaySessionStorage";

export interface GatewayMobileConfig {
  gatewayBaseUrl: string | null;
}

export interface GatewayPairingExchangeOptions {
  pairingToken: string;
  deviceName?: string | null;
  metadata?: Record<string, unknown>;
  pairingExchangePath?: string;
  fetchImpl?: typeof fetch;
}

export interface GatewayPairingExchangeResponse {
  mobile_session: GatewayMobileSession;
  gateway_origin?: string;
}

const defaultGatewayPairingExchangePath = "/api/mobile/pairing/exchange";

export function buildGatewayPairingExchangePayload(
  options: GatewayPairingExchangeOptions
) {
  return {
    pairing_token: options.pairingToken,
    device_name: options.deviceName || undefined,
    device_metadata: {
      app: "attn-mobile",
      ...(options.metadata ?? {})
    }
  };
}

export async function exchangeGatewayPairingToken(
  config: GatewayMobileConfig,
  options: GatewayPairingExchangeOptions
): Promise<GatewayPairingExchangeResponse> {
  if (!config.gatewayBaseUrl) {
    throw new Error("Decision Gateway URL is not configured.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    joinBackendPath(
      config.gatewayBaseUrl,
      options.pairingExchangePath ?? defaultGatewayPairingExchangePath
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildGatewayPairingExchangePayload(options))
    }
  );

  if (!response.ok) {
    throw new Error("Unable to exchange gateway pairing token.");
  }

  const body = await parseSafeJson(response);
  const parsed = normalizeGatewayPairingExchangeResponse(body);
  if (!parsed) {
    throw new Error("Gateway pairing response was invalid.");
  }

  return parsed;
}

async function parseSafeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function normalizeGatewayPairingExchangeResponse(
  value: unknown
): GatewayPairingExchangeResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const mobileSession = normalizeGatewayMobileSession(source.mobile_session);
  if (!mobileSession) {
    return null;
  }

  return {
    mobile_session: mobileSession,
    ...optionalField("gateway_origin", source.gateway_origin)
  };
}

function normalizeGatewayMobileSession(value: unknown): GatewayMobileSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const sessionToken = normalizeOptionalString(source.session_token);
  if (!sessionToken) {
    return null;
  }

  return {
    session_token: sessionToken,
    ...optionalField("refresh_token", source.refresh_token),
    ...optionalField("expires_at", source.expires_at),
    ...optionalField("gateway_origin", source.gateway_origin),
    ...optionalField("subject_label", source.subject_label)
  };
}

function optionalField(key: keyof GatewayMobileSession, value: unknown) {
  const normalized = normalizeOptionalString(value);
  return normalized ? { [key]: normalized } : {};
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
