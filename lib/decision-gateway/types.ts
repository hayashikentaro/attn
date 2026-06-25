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
    decision_url: urlString,
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
    if (!options?.gatewayOrigin) {
      return;
    }

    const expectedOrigin = new URL(options.gatewayOrigin).origin;
    const actualOrigin = new URL(value.decision_url).origin;

    if (actualOrigin !== expectedOrigin) {
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
    decision_url: urlString,
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
    web_session_url: urlString.optional(),
    web_session_ticket: optionalTrimmedString,
    expires_at: dateTimeString
  })
  .strict()
  .refine((value) => value.web_session_url || value.web_session_ticket, {
    message: "Provide either web_session_url or web_session_ticket",
    path: ["web_session_url"]
  });

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
