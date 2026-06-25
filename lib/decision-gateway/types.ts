import { z } from "zod";

const requiredTrimmedString = z.string().trim().min(1);
const optionalTrimmedString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

const dateTimeString = z.string().trim().refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Must be a valid date-time string"
);

const urlString = z.string().trim().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Must be a valid http(s) URL");

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

const gatewayNavigableUrlString = urlString.superRefine((value, context) => {
  const keys = findGatewaySecretLikeUrlKeys(value);
  if (keys.length === 0) {
    return;
  }

  context.addIssue({
    code: "custom",
    message: `URL must not include secret-like query or fragment keys: ${keys.join(", ")}`
  });
});

export const gatewayNotificationPriorityValues = [
  "low",
  "normal",
  "high",
  "critical"
] as const;

export const gatewayObservabilityEventValues = [
  "notification_received",
  "notification_opened",
  "webview_open_failed",
  "session_refresh_failed",
  "token_missing",
  "pairing_completed"
] as const;

export type GatewayNotificationPriority =
  (typeof gatewayNotificationPriorityValues)[number];
export type GatewayObservabilityEventName =
  (typeof gatewayObservabilityEventValues)[number];

export const gatewayNotificationPayloadSchema = z
  .object({
    decision_id: optionalTrimmedString,
    task_id: optionalTrimmedString,
    decision_url: gatewayNavigableUrlString,
    title: requiredTrimmedString,
    summary: requiredTrimmedString,
    urgency: z.enum(gatewayNotificationPriorityValues).optional(),
    priority: z.enum(gatewayNotificationPriorityValues).optional(),
    dedupe_key: requiredTrimmedString,
    created_at: dateTimeString.optional(),
    occurred_at: dateTimeString.optional()
  })
  .strict()
  .refine((value) => value.decision_id || value.task_id, {
    message: "Provide either decision_id or task_id",
    path: ["decision_id"]
  })
  .refine((value) => value.urgency || value.priority, {
    message: "Provide either urgency or priority",
    path: ["urgency"]
  })
  .refine((value) => value.created_at || value.occurred_at, {
    message: "Provide either created_at or occurred_at",
    path: ["created_at"]
  });

export function createGatewayNotificationPayloadSchema(options?: {
  gatewayOrigin?: string | URL;
}) {
  return gatewayNotificationPayloadSchema.superRefine((value, context) => {
    if (!isGatewayOriginUrl(value.decision_url, options?.gatewayOrigin)) {
      context.addIssue({
        code: "custom",
        path: ["decision_url"],
        message: "Decision URL must match gateway origin"
      });
    }
  });
}

const jsonObjectSchema = z.record(z.string(), z.unknown());
const gatewayMobileSessionTokenSchema = requiredTrimmedString.max(4096);

export const gatewayMobileSessionSchema = z
  .object({
    session_token: gatewayMobileSessionTokenSchema,
    refresh_token: gatewayMobileSessionTokenSchema.optional(),
    issued_at: dateTimeString.optional(),
    expires_at: dateTimeString.optional(),
    gateway_origin: urlString.optional(),
    subject_label: optionalTrimmedString
  })
  .strict();

export const gatewayPairingExchangeRequestSchema = z
  .object({
    pairing_token: requiredTrimmedString.max(4096),
    device_name: optionalTrimmedString,
    device_metadata: jsonObjectSchema.default({})
  })
  .strict();

export const gatewayPairingExchangeResponseSchema = z
  .object({
    mobile_session: gatewayMobileSessionSchema,
    gateway_origin: urlString.optional()
  })
  .strict();

export const gatewayOpenSessionRequestSchema = z
  .object({
    mobile_session_token: gatewayMobileSessionTokenSchema,
    decision_url: gatewayNavigableUrlString,
    decision_id: optionalTrimmedString,
    task_id: optionalTrimmedString
  })
  .strict()
  .refine((value) => value.decision_id || value.task_id, {
    message: "Provide either decision_id or task_id",
    path: ["decision_id"]
  });

export const gatewayOpenSessionResponseSchema = z
  .object({
    web_session_url: gatewayNavigableUrlString.optional(),
    web_session_ticket: optionalTrimmedString,
    expires_at: dateTimeString
  })
  .strict()
  .refine((value) => value.web_session_url || value.web_session_ticket, {
    message: "Provide either web_session_url or web_session_ticket",
    path: ["web_session_url"]
  });

export function createGatewayOpenSessionRequestSchema(options?: {
  gatewayOrigin?: string | URL;
}) {
  return gatewayOpenSessionRequestSchema.superRefine((value, context) => {
    if (!isGatewayOriginUrl(value.decision_url, options?.gatewayOrigin)) {
      context.addIssue({
        code: "custom",
        path: ["decision_url"],
        message: "Decision URL must match gateway origin"
      });
    }
  });
}

export function createGatewayOpenSessionResponseSchema(options?: {
  gatewayOrigin?: string | URL;
}) {
  return gatewayOpenSessionResponseSchema.superRefine((value, context) => {
    if (
      value.web_session_url &&
      !isGatewayOriginUrl(value.web_session_url, options?.gatewayOrigin)
    ) {
      context.addIssue({
        code: "custom",
        path: ["web_session_url"],
        message: "Web session URL must match gateway origin"
      });
    }
  });
}

export const gatewayObservabilityEventSchema = z
  .object({
    event: z.enum(gatewayObservabilityEventValues),
    occurred_at: dateTimeString,
    decision_id: optionalTrimmedString,
    task_id: optionalTrimmedString,
    dedupe_key: optionalTrimmedString,
    metadata: jsonObjectSchema.default({})
  })
  .strict()
  .superRefine((value, context) => {
    for (const path of findGatewaySecretLikeKeys(value.metadata)) {
      context.addIssue({
        code: "custom",
        path: ["metadata", ...path],
        message: "Metadata must not include secret-like fields"
      });
    }
  });

export function findGatewaySecretLikeKeys(
  value: unknown,
  path: Array<string | number> = []
): Array<Array<string | number>> {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findGatewaySecretLikeKeys(item, [...path, index])
    );
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nestedPath = [...path, key];
    const keyMatches = secretLikeKeyPattern.test(key) ? [nestedPath] : [];
    return [
      ...keyMatches,
      ...findGatewaySecretLikeKeys(nestedValue, nestedPath)
    ];
  });
}

export function findGatewaySecretLikeUrlKeys(value: string): string[] {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [];
  }

  return uniqueStrings([
    ...findSecretLikeSearchParamKeys(url.searchParams),
    ...findSecretLikeFragmentKeys(url.hash)
  ]);
}

function isGatewayOriginUrl(value: string, gatewayOrigin: string | URL | undefined) {
  if (!gatewayOrigin) {
    return true;
  }

  try {
    return new URL(value).origin === new URL(gatewayOrigin).origin;
  } catch {
    return false;
  }
}

function findSecretLikeSearchParamKeys(params: URLSearchParams): string[] {
  return Array.from(params.keys()).filter(isSecretLikeUrlKey);
}

function findSecretLikeFragmentKeys(hash: string): string[] {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) {
    return [];
  }

  const queryStart = fragment.indexOf("?");
  const candidates =
    queryStart >= 0 ? [fragment.slice(queryStart + 1)] : [fragment];

  return uniqueStrings(
    candidates.flatMap((candidate) =>
      findSecretLikeSearchParamKeys(
        new URLSearchParams(candidate.replace(/^\?/, ""))
      )
    )
  );
}

function isSecretLikeUrlKey(key: string) {
  const normalized = key.toLowerCase().replace(/-/g, "_");
  return (
    secretLikeUrlKeyNames.has(normalized) || secretLikeKeyPattern.test(key)
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export type GatewayNotificationPayload = z.infer<
  typeof gatewayNotificationPayloadSchema
>;
export type GatewayPairingExchangeRequest = z.infer<
  typeof gatewayPairingExchangeRequestSchema
>;
export type GatewayPairingExchangeResponse = z.infer<
  typeof gatewayPairingExchangeResponseSchema
>;
export type GatewayMobileSession = z.infer<typeof gatewayMobileSessionSchema>;
export type GatewayOpenSessionRequest = z.infer<
  typeof gatewayOpenSessionRequestSchema
>;
export type GatewayOpenSessionResponse = z.infer<
  typeof gatewayOpenSessionResponseSchema
>;
export type GatewayObservabilityEvent = z.infer<
  typeof gatewayObservabilityEventSchema
>;
