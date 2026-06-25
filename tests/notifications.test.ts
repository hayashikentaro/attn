import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getHealthPayload } from "@/app/api/health/route";
import { isIngestAuthorized } from "@/lib/auth";
import {
  acknowledgeNotification,
  coerceJsonObject,
  createNotification,
  getBucketForNotification,
  type IntegrationResult,
  type JsonObject,
  type NormalizedNewNotification,
  type NotificationEventInput,
  type NotificationEventRecord,
  type NotificationRecord,
  type NotificationRepository,
  type NotificationWithEvents,
  recordDecision,
  ingestNotification,
  reopenNotification,
  resolveNotification,
  snoozeNotification,
  sortNotificationsForBucket
} from "@/lib/notifications";
import type {
  ListNotificationsQuery,
  NotificationStatus
} from "@/lib/validation";

class MemoryNotificationRepository implements NotificationRepository {
  notifications: NotificationRecord[] = [];
  events: NotificationEventRecord[] = [];

  async findDuplicateNotification(
    input: Pick<NormalizedNewNotification, "source" | "external_id" | "dedupe_key">
  ) {
    if (!input.external_id && !input.dedupe_key) {
      return null;
    }

    return (
      this.notifications.find(
        (notification) =>
          (input.external_id &&
            notification.source === input.source &&
            notification.external_id === input.external_id) ||
          (input.dedupe_key && notification.dedupe_key === input.dedupe_key)
      ) ?? null
    );
  }

  async createNotification(input: NormalizedNewNotification) {
    const now = new Date().toISOString();
    const notification: NotificationRecord = {
      id: randomUUID(),
      source: input.source,
      external_id: input.external_id ?? null,
      dedupe_key: input.dedupe_key ?? null,
      schema_version: input.schema_version,
      kind: input.kind,
      priority: input.priority,
      status: input.status,
      title: input.title,
      summary: input.summary,
      detail: input.detail ?? null,
      why_it_matters: input.why_it_matters ?? null,
      suggested_action: input.suggested_action ?? null,
      source_url: input.source_url ?? null,
      related_run_id: input.related_run_id ?? null,
      related_task_id: input.related_task_id ?? null,
      payload_json: input.payload_json,
      snoozed_until: null,
      occurred_at: input.occurred_at,
      created_at: now,
      updated_at: now
    };

    this.notifications.push(notification);
    await this.createEvent({
      notification_id: notification.id,
      event_type: "created",
      actor: "api",
      metadata_json: {
        source: notification.source,
        kind: notification.kind
      }
    });

    return notification;
  }

  async createEvent(input: NotificationEventInput) {
    const event: NotificationEventRecord = {
      id: randomUUID(),
      notification_id: input.notification_id,
      event_type: input.event_type,
      actor: input.actor,
      metadata_json: input.metadata_json ?? {},
      created_at: new Date().toISOString()
    };

    this.events.push(event);
    return event;
  }

  async updateStatusWithEvent(
    id: string,
    status: NotificationStatus,
    snoozedUntil: string | null,
    event: Omit<NotificationEventInput, "notification_id">
  ) {
    const notification = this.notifications.find((item) => item.id === id);
    if (!notification) {
      return null;
    }

    notification.status = status;
    notification.snoozed_until = snoozedUntil;
    notification.updated_at = new Date().toISOString();
    await this.createEvent({
      notification_id: id,
      event_type: event.event_type,
      actor: event.actor,
      metadata_json: event.metadata_json
    });

    return notification;
  }

  async getNotificationWithEvents(id: string): Promise<NotificationWithEvents | null> {
    const notification = this.notifications.find((item) => item.id === id);
    if (!notification) {
      return null;
    }

    return {
      ...notification,
      events: this.events.filter((event) => event.notification_id === id)
    };
  }

  async listNotifications(query: ListNotificationsQuery) {
    let notifications = this.notifications.filter((notification) => {
      if (query.bucket !== "all") {
        return getBucketForNotification(notification) === query.bucket;
      }

      return true;
    });

    if (query.status) {
      notifications = notifications.filter(
        (notification) => notification.status === query.status
      );
    }

    if (query.source) {
      notifications = notifications.filter(
        (notification) => notification.source === query.source
      );
    }

    if (query.kind) {
      notifications = notifications.filter(
        (notification) => notification.kind === query.kind
      );
    }

    if (query.priority) {
      notifications = notifications.filter(
        (notification) => notification.priority === query.priority
      );
    }

    return sortNotificationsForBucket(notifications, query.bucket).slice(
      0,
      query.limit
    );
  }
}

const skipped = async (): Promise<IntegrationResult> => ({ status: "skipped" });

function input(overrides: Partial<Parameters<typeof createNotification>[0]> = {}) {
  return {
    source: "vercel",
    kind: "error",
    priority: "high",
    title: "Production deployment failed",
    summary: "Build failed during production deployment.",
    occurred_at: "2026-06-25T12:00:00.000Z",
    payload_json: {},
    ...overrides
  } as Parameters<typeof createNotification>[0];
}

function item(status: NotificationStatus, snoozedUntil: string | null = null) {
  return {
    status,
    snoozed_until: snoozedUntil
  };
}

describe("notifications", () => {
  it("creates a notification and records a created event", async () => {
    const repository = new MemoryNotificationRepository();

    const notification = await createNotification(input(), {
      repository,
      sendSlack: skipped,
      sendNovu: skipped
    });

    expect(notification.title).toBe("Production deployment failed");
    expect(notification.schema_version).toBe("1");
    expect(repository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_id: notification.id,
          event_type: "created",
          actor: "api"
        })
      ])
    );
  });

  it("coerces JSON strings returned by the database into objects", () => {
    expect(coerceJsonObject('{"check":"idempotency"}')).toEqual({
      check: "idempotency"
    });
    expect(coerceJsonObject({ already: "object" })).toEqual({
      already: "object"
    });
    expect(coerceJsonObject("not json")).toEqual({});
    expect(coerceJsonObject(["not", "an", "object"])).toEqual({});
  });

  it("creates a notification with external_id and schema_version", async () => {
    const repository = new MemoryNotificationRepository();

    const result = await ingestNotification(
      input({
        external_id: "deployment-123",
        schema_version: "2"
      }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );

    expect(result.duplicated).toBe(false);
    expect(result.notification.external_id).toBe("deployment-123");
    expect(result.notification.schema_version).toBe("2");
    expect(repository.notifications).toHaveLength(1);
  });

  it("does not create another notification for duplicate source and external_id", async () => {
    const repository = new MemoryNotificationRepository();

    const first = await ingestNotification(
      input({ external_id: "deployment-123" }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );
    const duplicate = await ingestNotification(
      input({
        external_id: "deployment-123",
        title: "Retried deployment payload"
      }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );

    expect(duplicate.duplicated).toBe(true);
    expect(duplicate.notification.id).toBe(first.notification.id);
    expect(repository.notifications).toHaveLength(1);
    expect(repository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_id: first.notification.id,
          event_type: "duplicate_received",
          actor: "api"
        })
      ])
    );
  });

  it("does not create another notification for duplicate dedupe_key", async () => {
    const repository = new MemoryNotificationRepository();

    const first = await ingestNotification(
      input({ source: "vercel", dedupe_key: "global-dedupe-key" }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );
    const duplicate = await ingestNotification(
      input({
        source: "agent",
        dedupe_key: "global-dedupe-key",
        title: "Same incident from another source"
      }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );

    expect(duplicate.duplicated).toBe(true);
    expect(duplicate.notification.id).toBe(first.notification.id);
    expect(repository.notifications).toHaveLength(1);
    expect(repository.events.at(-1)).toMatchObject({
      event_type: "duplicate_received",
      metadata_json: expect.objectContaining({
        dedupe_key: "global-dedupe-key"
      })
    });
  });

  it("requires the ingest token when configured", () => {
    expect(isIngestAuthorized(new Headers(), "secret")).toBe(false);
    expect(
      isIngestAuthorized(new Headers({ Authorization: "Bearer secret" }), "secret")
    ).toBe(true);
    expect(isIngestAuthorized(new Headers({ "x-attn-token": "secret" }), "secret")).toBe(
      true
    );
    expect(isIngestAuthorized(new Headers(), undefined)).toBe(true);
  });

  it("maps internal statuses to queue buckets", () => {
    const now = new Date("2026-06-25T12:00:00.000Z");

    expect(getBucketForNotification(item("new"), now)).toBe("needs_you");
    expect(getBucketForNotification(item("acknowledged"), now)).toBe("needs_you");
    expect(
      getBucketForNotification(
        item("snoozed", "2026-06-25T13:00:00.000Z"),
        now
      )
    ).toBe("later");
    expect(
      getBucketForNotification(
        item("snoozed", "2026-06-25T11:00:00.000Z"),
        now
      )
    ).toBe("needs_you");
    expect(getBucketForNotification(item("resolved"), now)).toBe("done");
  });

  it("acknowledges a notification and records an event", async () => {
    const repository = new MemoryNotificationRepository();
    const notification = await createNotification(input(), {
      repository,
      sendSlack: skipped,
      sendNovu: skipped
    });

    await acknowledgeNotification(notification.id, { repository });

    expect(repository.notifications[0].status).toBe("acknowledged");
    expect(repository.events.at(-1)).toMatchObject({
      event_type: "acknowledged",
      actor: "user"
    });
  });

  it("snoozes a notification and records the until timestamp", async () => {
    const repository = new MemoryNotificationRepository();
    const notification = await createNotification(input(), {
      repository,
      sendSlack: skipped,
      sendNovu: skipped
    });

    await snoozeNotification(
      notification.id,
      { minutes: 60 },
      {
        repository,
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );

    expect(repository.notifications[0].status).toBe("snoozed");
    expect(repository.notifications[0].snoozed_until).toBe(
      "2026-06-25T13:00:00.000Z"
    );
    expect(repository.events.at(-1)?.metadata_json).toEqual({
      until: "2026-06-25T13:00:00.000Z"
    });
  });

  it("resolves and reopens a notification", async () => {
    const repository = new MemoryNotificationRepository();
    const notification = await createNotification(input(), {
      repository,
      sendSlack: skipped,
      sendNovu: skipped
    });

    await resolveNotification(notification.id, { repository });
    expect(repository.notifications[0].status).toBe("resolved");
    expect(repository.events.at(-1)?.event_type).toBe("resolved");

    await reopenNotification(notification.id, { repository });
    expect(repository.notifications[0].status).toBe("new");
    expect(repository.notifications[0].snoozed_until).toBeNull();
    expect(repository.events.at(-1)?.event_type).toBe("reopened");
  });

  it("does not fail notification creation when Slack fails", async () => {
    const repository = new MemoryNotificationRepository();
    const metadata: JsonObject = { status: 500, statusText: "broken" };

    const notification = await createNotification(input(), {
      repository,
      sendSlack: async () => ({ status: "failed", metadata }),
      sendNovu: skipped
    });

    expect(notification.id).toBeTruthy();
    expect(repository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "slack_failed",
          actor: "slack",
          metadata_json: metadata
        })
      ])
    );
  });

  it("records decision actions as events", async () => {
    const repository = new MemoryNotificationRepository();
    const notification = await createNotification(
      input({ kind: "checkpoint", priority: "critical" }),
      {
        repository,
        sendSlack: skipped,
        sendNovu: skipped
      }
    );

    const event = await recordDecision(
      notification.id,
      {
        decision: "approve",
        comment: "Looks good",
        metadata: { runId: "run-1" }
      },
      { repository }
    );

    expect(event).toMatchObject({
      event_type: "decision:approve",
      actor: "user",
      metadata_json: {
        comment: "Looks good",
        metadata: { runId: "run-1" }
      }
    });
  });

  it("returns safe health payloads", async () => {
    const now = () => new Date("2026-06-25T12:00:00.000Z");

    await expect(getHealthPayload(async () => undefined, now)).resolves.toEqual({
      app: "attn",
      status: "ok",
      checked_at: "2026-06-25T12:00:00.000Z",
      database: {
        ok: true
      }
    });

    await expect(
      getHealthPayload(async () => {
        throw new Error("contains no secret details in payload");
      }, now)
    ).resolves.toEqual({
      app: "attn",
      status: "degraded",
      checked_at: "2026-06-25T12:00:00.000Z",
      database: {
        ok: false
      }
    });
  });
});
