import { z } from "zod";

export const notificationPriorityValues = [
  "low",
  "normal",
  "high",
  "critical"
] as const;

export const notificationStatusValues = [
  "new",
  "seen",
  "acknowledged",
  "snoozed",
  "resolved"
] as const;

export const queueBucketValues = [
  "needs_you",
  "later",
  "done",
  "all"
] as const;

export const decisionValues = [
  "approve",
  "approve_with_condition",
  "reject",
  "ask_follow_up",
  "suspend"
] as const;

export type NotificationPriority = (typeof notificationPriorityValues)[number];
export type NotificationStatus = (typeof notificationStatusValues)[number];
export type QueueBucket = (typeof queueBucketValues)[number];
export type DecisionValue = (typeof decisionValues)[number];

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

export const jsonObjectSchema = z.record(z.string(), z.unknown());

export const createNotificationInputSchema = z.object({
  source: requiredTrimmedString,
  external_id: optionalTrimmedString,
  dedupe_key: optionalTrimmedString,
  schema_version: requiredTrimmedString.default("1"),
  kind: requiredTrimmedString.default("info"),
  priority: z.enum(notificationPriorityValues).default("normal"),
  title: requiredTrimmedString,
  summary: requiredTrimmedString,
  detail: optionalTrimmedString,
  why_it_matters: optionalTrimmedString,
  suggested_action: optionalTrimmedString,
  source_url: optionalTrimmedString,
  related_run_id: optionalTrimmedString,
  related_task_id: optionalTrimmedString,
  occurred_at: dateTimeString.optional(),
  payload_json: jsonObjectSchema.default({})
});

export const listNotificationsQuerySchema = z.object({
  bucket: z.enum(queueBucketValues).default("all"),
  status: z.enum(notificationStatusValues).optional(),
  source: optionalTrimmedString,
  kind: optionalTrimmedString,
  priority: z.enum(notificationPriorityValues).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100)
});

export const notificationIdSchema = z.uuid();

export const snoozeInputSchema = z
  .object({
    until: dateTimeString.optional(),
    minutes: z.coerce.number().int().min(1).max(60 * 24 * 365).optional()
  })
  .refine((value) => value.until || value.minutes, {
    message: "Provide either until or minutes"
  });

export const decisionInputSchema = z.object({
  decision: z.enum(decisionValues),
  comment: z.string().trim().optional(),
  metadata: jsonObjectSchema.default({})
});

export type CreateNotificationInput = z.input<
  typeof createNotificationInputSchema
>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type SnoozeInput = z.infer<typeof snoozeInputSchema>;
export type DecisionInput = z.infer<typeof decisionInputSchema>;

export function formatValidationError(error: z.ZodError) {
  return {
    error: "Validation failed",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }))
  };
}
