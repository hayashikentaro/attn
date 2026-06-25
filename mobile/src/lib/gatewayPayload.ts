import { normalizeBackendUrl } from "./backend";

const gatewayPriorityValues = new Set(["low", "normal", "high", "critical"]);

const gatewayNotificationPayloadKeys = new Set([
  "decision_id",
  "task_id",
  "decision_url",
  "title",
  "summary",
  "urgency",
  "priority",
  "dedupe_key",
  "created_at",
  "occurred_at"
]);

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

export interface GatewayNotificationPayload {
  decision_id?: string;
  task_id?: string;
  decision_url: string;
  title: string;
  summary: string;
  urgency?: "low" | "normal" | "high" | "critical";
  priority?: "low" | "normal" | "high" | "critical";
  dedupe_key: string;
  created_at?: string;
  occurred_at?: string;
}

export type GatewayNotificationPayloadRejectReason =
  | "gateway_not_configured"
  | "invalid_payload"
  | "wrong_origin"
  | "secret_like_payload"
  | "secret_like_url";

export type GatewayNotificationPayloadParseResult =
  | {
      ok: true;
      payload: GatewayNotificationPayload;
    }
  | {
      ok: false;
      reason: GatewayNotificationPayloadRejectReason;
    };

export function parseGatewayNotificationPayload(
  value: unknown,
  gatewayBaseUrl: string | null | undefined
): GatewayNotificationPayloadParseResult {
  const gatewayOrigin = normalizeGatewayOrigin(gatewayBaseUrl);
  if (!gatewayOrigin) {
    return reject("gateway_not_configured");
  }

  if (!isPlainObject(value)) {
    return reject("invalid_payload");
  }

  if (hasSecretLikeKey(value)) {
    return reject("secret_like_payload");
  }

  if (Object.keys(value).some((key) => !gatewayNotificationPayloadKeys.has(key))) {
    return reject("invalid_payload");
  }

  const decisionId = optionalString(value.decision_id);
  const taskId = optionalString(value.task_id);
  const decisionUrl = requiredString(value.decision_url);
  const title = requiredString(value.title);
  const summary = requiredString(value.summary);
  const urgency = optionalPriority(value.urgency);
  const priority = optionalPriority(value.priority);
  const dedupeKey = requiredString(value.dedupe_key);
  const createdAt = optionalDateTime(value.created_at);
  const occurredAt = optionalDateTime(value.occurred_at);

  if (
    ("decision_id" in value && !decisionId) ||
    ("task_id" in value && !taskId) ||
    ("urgency" in value && !urgency) ||
    ("priority" in value && !priority) ||
    ("created_at" in value && !createdAt) ||
    ("occurred_at" in value && !occurredAt) ||
    (!decisionId && !taskId) ||
    !decisionUrl ||
    !title ||
    !summary ||
    (!urgency && !priority) ||
    !dedupeKey ||
    (!createdAt && !occurredAt)
  ) {
    return reject("invalid_payload");
  }

  const url = parseHttpUrl(decisionUrl);
  if (!url) {
    return reject("invalid_payload");
  }

  if (url.origin !== gatewayOrigin) {
    return reject("wrong_origin");
  }

  if (findSecretLikeUrlKeys(url).length > 0) {
    return reject("secret_like_url");
  }

  return {
    ok: true,
    payload: {
      ...(decisionId ? { decision_id: decisionId } : {}),
      ...(taskId ? { task_id: taskId } : {}),
      decision_url: url.toString(),
      title,
      summary,
      ...(urgency ? { urgency } : {}),
      ...(priority ? { priority } : {}),
      dedupe_key: dedupeKey,
      ...(createdAt ? { created_at: createdAt } : {}),
      ...(occurredAt ? { occurred_at: occurredAt } : {})
    }
  };
}

function reject(
  reason: GatewayNotificationPayloadRejectReason
): GatewayNotificationPayloadParseResult {
  return {
    ok: false,
    reason
  };
}

function normalizeGatewayOrigin(gatewayBaseUrl: string | null | undefined) {
  const normalized = normalizeBackendUrl(gatewayBaseUrl);
  if (!normalized) {
    return null;
  }

  return new URL(normalized).origin;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown) {
  const normalized = optionalString(value);
  return normalized ?? null;
}

function optionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function optionalPriority(
  value: unknown
): GatewayNotificationPayload["priority"] | null {
  const normalized = optionalString(value);
  if (!normalized || !gatewayPriorityValues.has(normalized)) {
    return null;
  }

  return normalized as GatewayNotificationPayload["priority"];
}

function optionalDateTime(value: unknown) {
  const normalized = optionalString(value);
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function hasSecretLikeKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasSecretLikeKey);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      secretLikeKeyPattern.test(key) || hasSecretLikeKey(nestedValue)
  );
}

function findSecretLikeUrlKeys(url: URL) {
  return [
    ...findSecretLikeSearchParamKeys(url.searchParams),
    ...findSecretLikeFragmentKeys(url.hash)
  ];
}

function findSecretLikeSearchParamKeys(params: URLSearchParams) {
  return Array.from(params.keys()).filter(isSecretLikeUrlKey);
}

function findSecretLikeFragmentKeys(hash: string) {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) {
    return [];
  }

  const queryStart = fragment.indexOf("?");
  const candidate = queryStart >= 0 ? fragment.slice(queryStart + 1) : fragment;
  return findSecretLikeSearchParamKeys(new URLSearchParams(candidate));
}

function isSecretLikeUrlKey(key: string) {
  const normalized = key.toLowerCase().replace(/-/g, "_");
  return (
    secretLikeUrlKeyNames.has(normalized) || secretLikeKeyPattern.test(key)
  );
}
