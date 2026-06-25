import { getSql } from "@/lib/db";
import { sendNovuNotification } from "@/lib/novu";
import { sendSlackNotification } from "@/lib/slack";
import { addMinutes } from "@/lib/time";
import type {
  CreateNotificationInput,
  DecisionInput,
  ListNotificationsQuery,
  NotificationPriority,
  NotificationStatus,
  QueueBucket,
  SnoozeInput
} from "@/lib/validation";

export type JsonObject = Record<string, unknown>;

export interface NotificationRecord {
  id: string;
  source: string;
  kind: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  title: string;
  summary: string;
  detail: string | null;
  why_it_matters: string | null;
  suggested_action: string | null;
  source_url: string | null;
  related_run_id: string | null;
  related_task_id: string | null;
  payload_json: JsonObject;
  snoozed_until: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationEventRecord {
  id: string;
  notification_id: string;
  event_type: string;
  actor: string;
  metadata_json: JsonObject;
  created_at: string;
}

export interface NotificationWithEvents extends NotificationRecord {
  events: NotificationEventRecord[];
}

export interface NormalizedNewNotification {
  source: string;
  kind: string;
  priority: NotificationPriority;
  status: "new";
  title: string;
  summary: string;
  detail?: string;
  why_it_matters?: string;
  suggested_action?: string;
  source_url?: string;
  related_run_id?: string;
  related_task_id?: string;
  payload_json: JsonObject;
  snoozed_until: null;
  occurred_at: string;
}

export interface NotificationEventInput {
  notification_id: string;
  event_type: string;
  actor: string;
  metadata_json?: JsonObject;
}

export interface NotificationRepository {
  createNotification(input: NormalizedNewNotification): Promise<NotificationRecord>;
  createEvent(input: NotificationEventInput): Promise<NotificationEventRecord>;
  updateStatusWithEvent(
    id: string,
    status: NotificationStatus,
    snoozedUntil: string | null,
    event: Omit<NotificationEventInput, "notification_id">
  ): Promise<NotificationRecord | null>;
  getNotificationWithEvents(id: string): Promise<NotificationWithEvents | null>;
  listNotifications(query: ListNotificationsQuery): Promise<NotificationRecord[]>;
}

export interface IntegrationResult {
  status: "skipped" | "sent" | "failed";
  metadata?: JsonObject;
}

export interface NotificationServiceOptions {
  repository?: NotificationRepository;
  now?: () => Date;
  sendSlack?: (notification: NotificationRecord) => Promise<IntegrationResult>;
  sendNovu?: (notification: NotificationRecord) => Promise<IntegrationResult>;
}

type DbNotificationRow = Omit<
  NotificationRecord,
  "occurred_at" | "created_at" | "updated_at" | "snoozed_until"
> & {
  occurred_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  snoozed_until: Date | string | null;
};

type DbNotificationEventRow = Omit<
  NotificationEventRecord,
  "created_at"
> & {
  created_at: Date | string;
};

const priorityRank: Record<NotificationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeNotification(row: DbNotificationRow): NotificationRecord {
  return {
    ...row,
    payload_json: row.payload_json ?? {},
    snoozed_until: row.snoozed_until ? toIso(row.snoozed_until) : null,
    occurred_at: toIso(row.occurred_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

function serializeEvent(row: DbNotificationEventRow): NotificationEventRecord {
  return {
    ...row,
    metadata_json: row.metadata_json ?? {},
    created_at: toIso(row.created_at)
  };
}

export function normalizeCreateNotificationInput(
  input: CreateNotificationInput,
  now = new Date()
): NormalizedNewNotification {
  return {
    source: input.source,
    kind: input.kind ?? "info",
    priority: input.priority ?? "normal",
    status: "new",
    title: input.title,
    summary: input.summary,
    detail: input.detail,
    why_it_matters: input.why_it_matters,
    suggested_action: input.suggested_action,
    source_url: input.source_url,
    related_run_id: input.related_run_id,
    related_task_id: input.related_task_id,
    payload_json: input.payload_json ?? {},
    snoozed_until: null,
    occurred_at: input.occurred_at
      ? new Date(input.occurred_at).toISOString()
      : now.toISOString()
  };
}

export function getBucketForNotification(
  notification: Pick<NotificationRecord, "status" | "snoozed_until">,
  now = new Date()
): Exclude<QueueBucket, "all"> {
  if (notification.status === "resolved") {
    return "done";
  }

  if (
    notification.status === "snoozed" &&
    notification.snoozed_until &&
    new Date(notification.snoozed_until).getTime() > now.getTime()
  ) {
    return "later";
  }

  return "needs_you";
}

export function sortNotificationsForBucket(
  notifications: NotificationRecord[],
  bucket: QueueBucket,
  now = new Date()
) {
  const copy = [...notifications];

  if (bucket === "needs_you") {
    return copy.sort((a, b) => {
      const rankDelta = priorityRank[b.priority] - priorityRank[a.priority];
      if (rankDelta !== 0) {
        return rankDelta;
      }

      return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    });
  }

  if (bucket === "later") {
    return copy.sort((a, b) => {
      const aTime = a.snoozed_until ? new Date(a.snoozed_until).getTime() : now.getTime();
      const bTime = b.snoozed_until ? new Date(b.snoozed_until).getTime() : now.getTime();
      return aTime - bTime;
    });
  }

  return copy.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function getPostgresNotificationRepository(): NotificationRepository {
  const sql = getSql();

  return {
    async createNotification(input) {
      return sql.begin(async (tx) => {
        const rows = (await tx`
          insert into notifications (
            source,
            kind,
            priority,
            status,
            title,
            summary,
            detail,
            why_it_matters,
            suggested_action,
            source_url,
            related_run_id,
            related_task_id,
            payload_json,
            snoozed_until,
            occurred_at
          )
          values (
            ${input.source},
            ${input.kind},
            ${input.priority},
            ${input.status},
            ${input.title},
            ${input.summary},
            ${input.detail ?? null},
            ${input.why_it_matters ?? null},
            ${input.suggested_action ?? null},
            ${input.source_url ?? null},
            ${input.related_run_id ?? null},
            ${input.related_task_id ?? null},
            ${JSON.stringify(input.payload_json)}::jsonb,
            ${input.snoozed_until},
            ${input.occurred_at}
          )
          returning *
        `) as unknown as DbNotificationRow[];
        const [row] = rows;

        await tx`
          insert into notification_events (
            notification_id,
            event_type,
            actor,
            metadata_json
          )
          values (${row.id}, 'created', 'api', ${JSON.stringify({
            source: input.source,
            kind: input.kind
          })}::jsonb)
        `;

        return serializeNotification(row);
      });
    },

    async createEvent(input) {
      const rows = (await sql`
        insert into notification_events (
          notification_id,
          event_type,
          actor,
          metadata_json
        )
        values (
          ${input.notification_id},
          ${input.event_type},
          ${input.actor},
          ${JSON.stringify(input.metadata_json ?? {})}::jsonb
        )
        returning *
      `) as unknown as DbNotificationEventRow[];
      const [row] = rows;

      return serializeEvent(row);
    },

    async updateStatusWithEvent(id, status, snoozedUntil, event) {
      return sql.begin(async (tx) => {
        const rows = (await tx`
          update notifications
          set status = ${status},
              snoozed_until = ${snoozedUntil}
          where id = ${id}
          returning *
        `) as unknown as DbNotificationRow[];
        const [row] = rows;

        if (!row) {
          return null;
        }

        await tx`
          insert into notification_events (
            notification_id,
            event_type,
            actor,
            metadata_json
          )
          values (
            ${id},
            ${event.event_type},
            ${event.actor},
            ${JSON.stringify(event.metadata_json ?? {})}::jsonb
          )
        `;

        return serializeNotification(row);
      });
    },

    async getNotificationWithEvents(id) {
      const notificationRows = (await sql`
        select *
        from notifications
        where id = ${id}
        limit 1
      `) as unknown as DbNotificationRow[];
      const [notificationRow] = notificationRows;

      if (!notificationRow) {
        return null;
      }

      const eventRows = (await sql`
        select *
        from notification_events
        where notification_id = ${id}
        order by created_at desc
      `) as unknown as DbNotificationEventRow[];

      return {
        ...serializeNotification(notificationRow),
        events: eventRows.map(serializeEvent)
      };
    },

    async listNotifications(query) {
      const bucketCondition =
        query.bucket === "needs_you"
          ? sql`and (status in ('new', 'seen', 'acknowledged') or (status = 'snoozed' and snoozed_until <= now()))`
          : query.bucket === "later"
            ? sql`and status = 'snoozed' and snoozed_until > now()`
            : query.bucket === "done"
              ? sql`and status = 'resolved'`
              : sql``;

      const statusCondition = query.status
        ? sql`and status = ${query.status}`
        : sql``;
      const sourceCondition = query.source
        ? sql`and source = ${query.source}`
        : sql``;
      const kindCondition = query.kind ? sql`and kind = ${query.kind}` : sql``;
      const priorityCondition = query.priority
        ? sql`and priority = ${query.priority}`
        : sql``;

      const orderBy =
        query.bucket === "needs_you"
          ? sql`
              order by
                case priority
                  when 'critical' then 4
                  when 'high' then 3
                  when 'normal' then 2
                  else 1
                end desc,
                occurred_at desc
            `
          : query.bucket === "later"
            ? sql`order by snoozed_until asc nulls last`
            : sql`order by updated_at desc`;

      const rows = (await sql`
        select *
        from notifications
        where true
          ${bucketCondition}
          ${statusCondition}
          ${sourceCondition}
          ${kindCondition}
          ${priorityCondition}
        ${orderBy}
        limit ${query.limit}
      `) as unknown as DbNotificationRow[];

      return rows.map(serializeNotification);
    }
  };
}

function getRepository(options?: NotificationServiceOptions) {
  return options?.repository ?? getPostgresNotificationRepository();
}

async function recordIntegrationResult(
  repository: NotificationRepository,
  notificationId: string,
  integration: "slack" | "novu",
  result: IntegrationResult
) {
  if (result.status === "skipped") {
    return;
  }

  try {
    await repository.createEvent({
      notification_id: notificationId,
      event_type:
        result.status === "sent"
          ? `${integration}_sent`
          : `${integration}_failed`,
      actor: integration,
      metadata_json: result.metadata ?? {}
    });
  } catch {
    // Side-channel event recording must not make ingestion fail after storage.
  }
}

export async function createNotification(
  input: CreateNotificationInput,
  options: NotificationServiceOptions = {}
) {
  const repository = getRepository(options);
  const notification = await repository.createNotification(
    normalizeCreateNotificationInput(input, options.now?.() ?? new Date())
  );

  const slackResult = await (options.sendSlack ?? sendSlackNotification)(
    notification
  );
  await recordIntegrationResult(
    repository,
    notification.id,
    "slack",
    slackResult
  );

  const novuResult = await (options.sendNovu ?? sendNovuNotification)(
    notification
  );
  await recordIntegrationResult(repository, notification.id, "novu", novuResult);

  return notification;
}

export async function listNotifications(
  query: ListNotificationsQuery,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).listNotifications(query);
}

export async function getNotificationWithEvents(
  id: string,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).getNotificationWithEvents(id);
}

export async function acknowledgeNotification(
  id: string,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).updateStatusWithEvent(id, "acknowledged", null, {
    event_type: "acknowledged",
    actor: "user",
    metadata_json: {}
  });
}

export async function snoozeNotification(
  id: string,
  input: SnoozeInput,
  options: NotificationServiceOptions = {}
) {
  const now = options.now?.() ?? new Date();
  const until = input.until
    ? new Date(input.until)
    : addMinutes(now, input.minutes ?? 60);

  return getRepository(options).updateStatusWithEvent(
    id,
    "snoozed",
    until.toISOString(),
    {
      event_type: "snoozed",
      actor: "user",
      metadata_json: {
        until: until.toISOString()
      }
    }
  );
}

export async function resolveNotification(
  id: string,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).updateStatusWithEvent(id, "resolved", null, {
    event_type: "resolved",
    actor: "user",
    metadata_json: {}
  });
}

export async function reopenNotification(
  id: string,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).updateStatusWithEvent(id, "new", null, {
    event_type: "reopened",
    actor: "user",
    metadata_json: {}
  });
}

export async function recordDecision(
  id: string,
  input: DecisionInput,
  options: NotificationServiceOptions = {}
) {
  return getRepository(options).createEvent({
    notification_id: id,
    event_type: `decision:${input.decision}`,
    actor: "user",
    metadata_json: {
      comment: input.comment,
      metadata: input.metadata ?? {}
    }
  });
}
