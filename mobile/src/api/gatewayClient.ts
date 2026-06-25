import { joinBackendPath } from "../lib/backend";
import type { GatewayMobileSession } from "../lib/gatewaySessionStorage";
import type { GatewayNotificationPayload } from "../lib/gatewayPayload";

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

export interface GatewayWebSessionTicketOptions {
  mobileSessionToken: string;
  intent: GatewayNotificationPayload;
  webSessionPath?: string;
  fetchImpl?: typeof fetch;
}

export interface GatewayWebSessionTicketResponse {
  web_session_url: string;
  expires_at: string;
}

const defaultGatewayPairingExchangePath = "/api/mobile/pairing/exchange";
const defaultGatewayWebSessionPath = "/api/mobile/web-sessions";

const secretLikeKeyPattern =
  /(^|[_-])(access[_-]?token|api[_-]?key|auth|authorization|bearer|credential|password|refresh[_-]?token|secret|session[_-]?token|token)([_-]|$)/i;

const secretLikeUrlKeyNames = new Set([
  "access_token",
  "api_key",
  "auth",
  "authorization",
  "bearer",
  "credential",
  "password",
  "refresh_token",
  "secret",
  "session_token",
  "token"
]);

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

export function buildGatewayWebSessionTicketPayload(
  options: GatewayWebSessionTicketOptions
) {
  return {
    mobile_session_token: options.mobileSessionToken,
    decision_url: options.intent.decision_url,
    ...(options.intent.decision_id
      ? { decision_id: options.intent.decision_id }
      : {}),
    ...(options.intent.task_id ? { task_id: options.intent.task_id } : {})
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

export async function createGatewayWebSessionTicket(
  config: GatewayMobileConfig,
  options: GatewayWebSessionTicketOptions
): Promise<GatewayWebSessionTicketResponse> {
  if (!config.gatewayBaseUrl) {
    throw new Error("Decision Gateway URL is not configured.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    joinBackendPath(
      config.gatewayBaseUrl,
      options.webSessionPath ?? defaultGatewayWebSessionPath
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildGatewayWebSessionTicketPayload(options))
    }
  );

  if (!response.ok) {
    throw new Error("Unable to create gateway web session ticket.");
  }

  const body = await parseSafeJson(response);
  const parsed = normalizeGatewayWebSessionTicketResponse(
    body,
    config.gatewayBaseUrl
  );
  if (!parsed) {
    throw new Error("Gateway web session ticket response was invalid.");
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

function normalizeGatewayWebSessionTicketResponse(
  value: unknown,
  gatewayBaseUrl: string
): GatewayWebSessionTicketResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const webSessionUrl = normalizeSameOriginUrl(
    source.web_session_url,
    gatewayBaseUrl
  );
  const expiresAt = normalizeDateTimeString(source.expires_at);
  if (!webSessionUrl || !expiresAt) {
    return null;
  }

  return {
    web_session_url: webSessionUrl,
    expires_at: expiresAt
  };
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

function normalizeDateTimeString(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function normalizeSameOriginUrl(value: unknown, gatewayBaseUrl: string) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);
    const gatewayOrigin = new URL(gatewayBaseUrl).origin;
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.origin !== gatewayOrigin ||
      findSecretLikeUrlKeys(url).length > 0
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function findSecretLikeUrlKeys(url: URL) {
  return [
    ...Array.from(url.searchParams.keys()).filter(isSecretLikeUrlKey),
    ...findSecretLikeFragmentKeys(url.hash)
  ];
}

function findSecretLikeFragmentKeys(hash: string) {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) {
    return [];
  }

  const queryStart = fragment.indexOf("?");
  const candidate = queryStart >= 0 ? fragment.slice(queryStart + 1) : fragment;
  return Array.from(new URLSearchParams(candidate).keys()).filter(
    isSecretLikeUrlKey
  );
}

function isSecretLikeUrlKey(key: string) {
  const normalized = key.toLowerCase().replace(/-/g, "_");
  return (
    secretLikeUrlKeyNames.has(normalized) || secretLikeKeyPattern.test(key)
  );
}
