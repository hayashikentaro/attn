import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET as getDiagnosticsRoute } from "@/app/api/diagnostics/route";
import { getHealthPayload } from "@/app/api/health/route";
import { POST as postNotification } from "@/app/api/notifications/route";
import { isIngestAuthorized } from "@/lib/auth";
import { getDiagnosticsPayload } from "@/lib/diagnostics";
import { formatEnvReport, getEnvReport } from "@/lib/env-validation";
import {
  createDevicePairingCode,
  exchangeDevicePairingCode,
  hashSecret,
  verifyDeviceRegistrationToken,
  type DevicePairingCodeRecord,
  type DevicePairingCodeStatus,
  type DevicePairingRepository,
  type DeviceRegistrationTokenRecord,
  type DeviceRegistrationTokenStatus
} from "@/lib/device-pairing";
import {
  hashDeviceToken,
  registerDevice,
  redactDevice,
  unregisterDevice,
  type DeviceRecord,
  type DeviceRepository
} from "@/lib/devices";
import { sendNovuNotification } from "@/lib/novu";
import {
  resolveTargetSubscriber,
  type SubscriberRecord,
  type SubscriberRepository
} from "@/lib/subscribers";
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
  type NotificationDeliveryInput,
  type NotificationDeliveryRecord,
  type NotificationDeliveryUpdateInput,
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
  DeviceProvider,
  ListNotificationsQuery,
  NotificationStatus
} from "@/lib/validation";
import {
  createNotificationInputSchema,
  formatValidationError
} from "@/lib/validation";
import {
  buildPairPayload,
  buildRegisterDevicePayload as buildSmokeRegisterDevicePayload,
  buildSmokeNotificationPayload,
  buildUnregisterDevicePayload,
  fakeExpoToken,
  redactSmokeText,
  requireSmokeConfig
} from "@/scripts/smoke-helpers";

class MemoryNotificationRepository implements NotificationRepository {
  notifications: NotificationRecord[] = [];
  events: NotificationEventRecord[] = [];
  deliveries: NotificationDeliveryRecord[] = [];

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

  async createDelivery(input: NotificationDeliveryInput) {
    const now = new Date().toISOString();
    const delivery: NotificationDeliveryRecord = {
      id: randomUUID(),
      notification_id: input.notification_id,
      channel: input.channel,
      provider: input.provider,
      status: input.status,
      attempts: input.attempts ?? 0,
      last_error: input.last_error ?? null,
      metadata_json: input.metadata_json ?? {},
      sent_at: input.sent_at ?? (input.status === "sent" ? now : null),
      created_at: now,
      updated_at: now
    };

    this.deliveries.push(delivery);
    return delivery;
  }

  async updateDelivery(id: string, input: NotificationDeliveryUpdateInput) {
    const delivery = this.deliveries.find((item) => item.id === id);
    if (!delivery) {
      return null;
    }

    delivery.status = input.status;
    delivery.attempts = input.attempts;
    delivery.last_error = input.last_error ?? null;
    delivery.metadata_json = input.metadata_json ?? {};
    delivery.sent_at = input.sent_at ?? (input.status === "sent" ? new Date().toISOString() : null);
    delivery.updated_at = new Date().toISOString();

    return delivery;
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
      events: this.events.filter((event) => event.notification_id === id),
      deliveries: this.deliveries.filter(
        (delivery) => delivery.notification_id === id
      )
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

class MemorySubscriberRepository implements SubscriberRepository {
  subscribers: SubscriberRecord[] = [];

  async findSubscriber(id: string) {
    return this.subscribers.find((subscriber) => subscriber.id === id) ?? null;
  }

  async findByExternalId(externalId: string) {
    return (
      this.subscribers.find(
        (subscriber) => subscriber.external_id === externalId
      ) ?? null
    );
  }

  async ensureDefaultSubscriber(input?: {
    external_id?: string;
    display_name?: string;
    email?: string;
    novu_subscriber_id?: string;
  }) {
    const externalId = input?.external_id ?? "attn-operator";
    const existing = await this.findByExternalId(externalId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const subscriber: SubscriberRecord = {
      id: randomUUID(),
      external_id: externalId,
      display_name: input?.display_name ?? "Default Attn operator",
      email: input?.email ?? null,
      novu_subscriber_id: input?.novu_subscriber_id ?? externalId,
      created_at: now,
      updated_at: now
    };

    this.subscribers.push(subscriber);
    return subscriber;
  }
}

class MemoryDeviceRepository implements DeviceRepository {
  devices: DeviceRecord[] = [];

  async upsertDevice(input: {
    subscriber_id: string;
    platform: DeviceRecord["platform"];
    provider: DeviceProvider;
    device_token_hash: string;
    device_name?: string;
    metadata_json?: JsonObject;
    last_seen_at: string;
  }) {
    const existing = this.devices.find(
      (device) =>
        device.subscriber_id === input.subscriber_id &&
        device.provider === input.provider &&
        device.device_token_hash === input.device_token_hash
    );

    if (existing) {
      existing.platform = input.platform;
      existing.device_name = input.device_name ?? null;
      existing.metadata_json = input.metadata_json ?? {};
      existing.last_seen_at = input.last_seen_at;
      existing.revoked_at = null;
      existing.updated_at = input.last_seen_at;
      return existing;
    }

    const device: DeviceRecord = {
      id: randomUUID(),
      subscriber_id: input.subscriber_id,
      platform: input.platform,
      provider: input.provider,
      device_token_hash: input.device_token_hash,
      device_name: input.device_name ?? null,
      last_seen_at: input.last_seen_at,
      revoked_at: null,
      metadata_json: input.metadata_json ?? {},
      created_at: input.last_seen_at,
      updated_at: input.last_seen_at
    };

    this.devices.push(device);
    return device;
  }

  async revokeDevice(input: {
    device_id?: string;
    subscriber_id?: string;
    provider?: DeviceProvider;
    device_token_hash?: string;
    revoked_at: string;
  }) {
    const device = input.device_id
      ? this.devices.find(
          (item) =>
            item.id === input.device_id &&
            (!input.subscriber_id || item.subscriber_id === input.subscriber_id)
        )
      : this.devices.find(
          (item) =>
            item.provider === input.provider &&
            item.device_token_hash === input.device_token_hash &&
            (!input.subscriber_id || item.subscriber_id === input.subscriber_id)
        );

    if (!device) {
      return null;
    }

    device.revoked_at = input.revoked_at;
    device.updated_at = input.revoked_at;
    return device;
  }
}

class MemoryDevicePairingRepository implements DevicePairingRepository {
  pairingCodes: DevicePairingCodeRecord[] = [];
  registrationTokens: DeviceRegistrationTokenRecord[] = [];

  async createPairingCode(input: {
    code_hash: string;
    subscriber_id: string;
    status: DevicePairingCodeStatus;
    expires_at: string;
    metadata_json?: JsonObject;
  }) {
    const now = new Date().toISOString();
    const record: DevicePairingCodeRecord = {
      id: randomUUID(),
      code_hash: input.code_hash,
      subscriber_id: input.subscriber_id,
      status: input.status,
      expires_at: input.expires_at,
      used_at: null,
      metadata_json: input.metadata_json ?? {},
      created_at: now,
      updated_at: now
    };

    this.pairingCodes.push(record);
    return record;
  }

  async findPairingCodeByHash(codeHash: string) {
    return this.pairingCodes.find((record) => record.code_hash === codeHash) ?? null;
  }

  async markPairingCodeUsed(id: string, usedAt: string) {
    const record = this.pairingCodes.find((item) => item.id === id);
    if (!record) {
      return null;
    }

    record.status = "used";
    record.used_at = usedAt;
    record.updated_at = usedAt;
    return record;
  }

  async createRegistrationToken(input: {
    token_hash: string;
    subscriber_id: string;
    status: DeviceRegistrationTokenStatus;
    expires_at: string;
    metadata_json?: JsonObject;
  }) {
    const now = new Date().toISOString();
    const record: DeviceRegistrationTokenRecord = {
      id: randomUUID(),
      token_hash: input.token_hash,
      subscriber_id: input.subscriber_id,
      status: input.status,
      expires_at: input.expires_at,
      revoked_at: null,
      metadata_json: input.metadata_json ?? {},
      created_at: now,
      updated_at: now
    };

    this.registrationTokens.push(record);
    return record;
  }

  async findRegistrationTokenByHash(tokenHash: string) {
    return (
      this.registrationTokens.find((record) => record.token_hash === tokenHash) ??
      null
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
    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_id: notification.id,
          channel: "in_app",
          provider: "none",
          status: "sent",
          attempts: 1
        })
      ])
    );
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

  it("defaults schema_version to 1 and reports invalid payloads cleanly", () => {
    const parsed = createNotificationInputSchema.safeParse({
      source: "agent",
      title: "Checkpoint needs approval",
      summary: "A decision is waiting."
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schema_version).toBe("1");
    }

    const invalid = createNotificationInputSchema.safeParse({
      source: "agent",
      summary: "Missing title"
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(formatValidationError(invalid.error)).toEqual(
        expect.objectContaining({
          error: "Validation failed",
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: "title"
            })
          ])
        })
      );
    }
  });

  it("returns clean 400 responses for invalid ingest requests", async () => {
    const originalToken = process.env.ATTN_INGEST_TOKEN;
    delete process.env.ATTN_INGEST_TOKEN;

    try {
      const invalidJson = await postNotification(
        new NextRequest("http://localhost:3999/api/notifications", {
          method: "POST",
          body: "{",
          headers: {
            "content-type": "application/json"
          }
        })
      );
      expect(invalidJson.status).toBe(400);
      await expect(invalidJson.json()).resolves.toEqual({
        error: "Invalid JSON body"
      });

      const invalidPayload = await postNotification(
        new NextRequest("http://localhost:3999/api/notifications", {
          method: "POST",
          body: JSON.stringify({
            source: "agent",
            summary: "Missing title"
          }),
          headers: {
            "content-type": "application/json"
          }
        })
      );
      expect(invalidPayload.status).toBe(400);
      await expect(invalidPayload.json()).resolves.toEqual(
        expect.objectContaining({
          error: "Validation failed"
        })
      );
    } finally {
      if (originalToken === undefined) {
        delete process.env.ATTN_INGEST_TOKEN;
      } else {
        process.env.ATTN_INGEST_TOKEN = originalToken;
      }
    }
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
    const firstDeliveryCount = repository.deliveries.length;
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
    expect(repository.deliveries).toHaveLength(firstDeliveryCount);
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
    const firstDeliveryCount = repository.deliveries.length;
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
    expect(repository.deliveries).toHaveLength(firstDeliveryCount);
    expect(repository.events.at(-1)).toMatchObject({
      event_type: "duplicate_received",
      metadata_json: expect.objectContaining({
        dedupe_key: "global-dedupe-key"
      })
    });
  });

  it("creates delivery rows for configured high-priority routes", async () => {
    const repository = new MemoryNotificationRepository();

    const result = await ingestNotification(input(), {
      repository,
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://slack.example.test/webhook",
        NOVU_SECRET_KEY: "novu-secret",
        NOVU_WORKFLOW_ID: "attn-workflow"
      },
      sendSlack: async () => ({ status: "sent", metadata: { status: 200 } }),
      sendNovu: async () => ({ status: "sent", metadata: { status: 202 } })
    });

    expect(result.duplicated).toBe(false);
    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_id: result.notification.id,
          channel: "in_app",
          provider: "none",
          status: "sent",
          attempts: 1
        }),
        expect.objectContaining({
          notification_id: result.notification.id,
          channel: "slack",
          provider: "slack_webhook",
          status: "sent",
          attempts: 1
        }),
        expect.objectContaining({
          notification_id: result.notification.id,
          channel: "novu",
          provider: "novu",
          status: "sent",
          attempts: 1
        })
      ])
    );
  });

  it("keeps normal-priority notifications in Attn only", async () => {
    const repository = new MemoryNotificationRepository();

    await ingestNotification(input({ priority: "normal" }), {
      repository,
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://slack.example.test/webhook",
        NOVU_SECRET_KEY: "novu-secret",
        NOVU_WORKFLOW_ID: "attn-workflow"
      },
      sendSlack: async () => ({ status: "sent" }),
      sendNovu: async () => ({ status: "sent" })
    });

    expect(repository.deliveries).toHaveLength(1);
    expect(repository.deliveries[0]).toMatchObject({
      channel: "in_app",
      provider: "none",
      status: "sent"
    });
  });

  it("records skipped external delivery rows when routes are wanted but not configured", async () => {
    const repository = new MemoryNotificationRepository();

    const result = await ingestNotification(input({ priority: "critical" }), {
      repository,
      env: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      sendSlack: async () => ({ status: "sent" }),
      sendNovu: async () => ({ status: "sent" })
    });

    expect(result.notification.id).toBeTruthy();
    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "slack",
          status: "skipped",
          attempts: 0,
          metadata_json: expect.objectContaining({
            reason: "slack_not_configured"
          })
        }),
        expect.objectContaining({
          channel: "novu",
          status: "skipped",
          attempts: 0,
          metadata_json: expect.objectContaining({
            reason: "novu_not_configured"
          })
        }),
        expect.objectContaining({
          channel: "push",
          status: "skipped",
          provider: "none",
          metadata_json: expect.objectContaining({
            reason: "future_push_not_configured"
          })
        })
      ])
    );
  });

  it("records delivery failure without failing notification creation", async () => {
    const repository = new MemoryNotificationRepository();

    const result = await ingestNotification(input(), {
      repository,
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://slack.example.test/webhook"
      },
      sendSlack: async () => ({
        status: "failed",
        metadata: {
          status: 500,
          statusText: "broken"
        }
      }),
      sendNovu: skipped
    });

    expect(result.notification.id).toBeTruthy();
    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          notification_id: result.notification.id,
          channel: "slack",
          status: "failed",
          attempts: 1,
          last_error: "500 broken"
        })
      ])
    );
    expect(repository.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "slack_failed",
          actor: "slack"
        })
      ])
    );
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
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://slack.example.test/webhook"
      },
      sendSlack: async () => ({ status: "failed", metadata }),
      sendNovu: skipped
    });

    expect(notification.id).toBeTruthy();
    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "slack",
          status: "failed",
          last_error: "500 broken"
        })
      ])
    );
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
      ok: true,
      status: "ok",
      database: "ok",
      timestamp: "2026-06-25T12:00:00.000Z"
    });

    await expect(
      getHealthPayload(async () => {
        throw new Error("contains no secret details in payload");
      }, now)
    ).resolves.toEqual({
      app: "attn",
      ok: false,
      status: "degraded",
      database: "unavailable",
      timestamp: "2026-06-25T12:00:00.000Z"
    });
  });

  it("resolves a default subscriber when none is specified", async () => {
    const repository = new MemorySubscriberRepository();

    const subscriber = await resolveTargetSubscriber(undefined, {
      repository,
      env: {
        NODE_ENV: "test",
        ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID: "default-human",
        NOVU_SUBSCRIBER_ID: "novu-human"
      } as NodeJS.ProcessEnv
    });

    expect(subscriber).toMatchObject({
      external_id: "default-human",
      novu_subscriber_id: "novu-human"
    });
  });

  it("creates pairing codes by storing only a hash", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const pairingRepository = new MemoryDevicePairingRepository();

    const result = await createDevicePairingCode(
      {
        expires_in_minutes: 10,
        metadata: {
          source: "manual-test"
        }
      },
      {
        subscriberRepository,
        repository: pairingRepository,
        generateCode: () => "ABCD-EFGH",
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );

    expect(result.pairing_code).toBe("ABCD-EFGH");
    expect(pairingRepository.pairingCodes).toHaveLength(1);
    expect(pairingRepository.pairingCodes[0]).toMatchObject({
      code_hash: hashSecret("ABCDEFGH"),
      status: "pending",
      expires_at: "2026-06-25T12:10:00.000Z"
    });
    expect(JSON.stringify(pairingRepository.pairingCodes[0])).not.toContain(
      "ABCD-EFGH"
    );
  });

  it("rejects expired pairing codes", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const pairingRepository = new MemoryDevicePairingRepository();

    await createDevicePairingCode(
      { expires_in_minutes: 1, metadata: {} },
      {
        subscriberRepository,
        repository: pairingRepository,
        generateCode: () => "EXPR-CODE",
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );

    await expect(
      exchangeDevicePairingCode(
        {
          pairing_code: "EXPR-CODE",
          metadata: {}
        },
        {
          repository: pairingRepository,
          now: () => new Date("2026-06-25T12:02:00.000Z")
        }
      )
    ).rejects.toThrow("Pairing code has expired");
  });

  it("exchanges a pairing code once for a scoped registration token", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const pairingRepository = new MemoryDevicePairingRepository();

    const pairing = await createDevicePairingCode(
      { expires_in_minutes: 10, metadata: {} },
      {
        subscriberRepository,
        repository: pairingRepository,
        generateCode: () => "PAIR-CODE",
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );
    const exchange = await exchangeDevicePairingCode(
      {
        pairing_code: "PAIR-CODE",
        device_name: "iPhone",
        metadata: {}
      },
      {
        repository: pairingRepository,
        generateToken: () => "attn_drt_test_registration_token",
        now: () => new Date("2026-06-25T12:01:00.000Z")
      }
    );

    expect(exchange).toMatchObject({
      subscriber_id: pairing.subscriber.id,
      registration_token: "attn_drt_test_registration_token",
      registration_token_expires_at: "2026-06-26T12:01:00.000Z"
    });
    expect(exchange).not.toHaveProperty("pairing_code");
    expect(pairingRepository.registrationTokens[0]).toMatchObject({
      token_hash: hashSecret("attn_drt_test_registration_token"),
      subscriber_id: pairing.subscriber.id,
      status: "active"
    });
    expect(JSON.stringify(pairingRepository.registrationTokens[0])).not.toContain(
      "attn_drt_test_registration_token"
    );

    await expect(
      exchangeDevicePairingCode(
        {
          pairing_code: "PAIR-CODE",
          metadata: {}
        },
        { repository: pairingRepository }
      )
    ).rejects.toThrow("Pairing code has already been used");
  });

  it("uses scoped registration tokens for device register and unregister", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const pairingRepository = new MemoryDevicePairingRepository();
    const deviceRepository = new MemoryDeviceRepository();

    await createDevicePairingCode(
      { expires_in_minutes: 10, metadata: {} },
      {
        subscriberRepository,
        repository: pairingRepository,
        generateCode: () => "REGI-CODE",
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );
    const exchange = await exchangeDevicePairingCode(
      {
        pairing_code: "REGI-CODE",
        metadata: {}
      },
      {
        repository: pairingRepository,
        generateToken: () => "attn_drt_scoped_token",
        now: () => new Date("2026-06-25T12:01:00.000Z")
      }
    );
    const authorization = await verifyDeviceRegistrationToken(
      exchange.registration_token,
      {
        repository: pairingRepository,
        now: () => new Date("2026-06-25T12:02:00.000Z")
      }
    );

    expect(
      isIngestAuthorized(
        new Headers({ Authorization: `Bearer ${exchange.registration_token}` }),
        "server-token"
      )
    ).toBe(false);

    const registered = await registerDevice(
      {
        platform: "expo",
        provider: "expo",
        device_token: "ExponentPushToken[scoped-secret]",
        metadata: {}
      },
      {
        subscriberRepository,
        deviceRepository,
        subscriberId: authorization.subscriber_id,
        updateNovuCredentials: async () => ({ status: "skipped" }),
        now: () => new Date("2026-06-25T12:02:00.000Z")
      }
    );

    expect(registered.device.subscriber_id).toBe(authorization.subscriber_id);
    expect(JSON.stringify(redactDevice(registered.device))).not.toContain(
      "ExponentPushToken"
    );

    const revoked = await unregisterDevice(
      {
        provider: "expo",
        device_token: "ExponentPushToken[scoped-secret]"
      },
      {
        deviceRepository,
        subscriberId: authorization.subscriber_id,
        now: () => new Date("2026-06-25T12:03:00.000Z")
      }
    );

    expect(revoked?.revoked_at).toBe("2026-06-25T12:03:00.000Z");
  });

  it("registers or updates a device without exposing raw tokens", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const deviceRepository = new MemoryDeviceRepository();
    const now = () => new Date("2026-06-25T12:00:00.000Z");

    const first = await registerDevice(
      {
        platform: "ios",
        provider: "expo",
        device_token: "ExponentPushToken[secret-token]",
        device_name: "iPhone",
        metadata: { appVersion: "1.0.0" }
      },
      {
        subscriberRepository,
        deviceRepository,
        now
      }
    );
    const second = await registerDevice(
      {
        platform: "ios",
        provider: "expo",
        device_token: "ExponentPushToken[secret-token]",
        device_name: "Renamed iPhone",
        metadata: {}
      },
      {
        subscriberRepository,
        deviceRepository,
        now
      }
    );

    expect(second.device.id).toBe(first.device.id);
    expect(deviceRepository.devices).toHaveLength(1);
    expect(second.device.device_token_hash).toBe(
      hashDeviceToken("ExponentPushToken[secret-token]")
    );
    expect(JSON.stringify(redactDevice(second.device))).not.toContain(
      "ExponentPushToken"
    );
  });

  it("unregisters a device by revoking it", async () => {
    const subscriberRepository = new MemorySubscriberRepository();
    const deviceRepository = new MemoryDeviceRepository();
    const registered = await registerDevice(
      {
        platform: "android",
        provider: "fcm",
        device_token: "fcm-secret",
        metadata: {}
      },
      {
        subscriberRepository,
        deviceRepository,
        now: () => new Date("2026-06-25T12:00:00.000Z")
      }
    );

    const revoked = await deviceRepository.revokeDevice({
      device_id: registered.device.id,
      revoked_at: "2026-06-25T12:05:00.000Z"
    });

    expect(revoked?.revoked_at).toBe("2026-06-25T12:05:00.000Z");
  });

  it("returns safe diagnostics without exposing secrets", async () => {
    const payload = await getDiagnosticsPayload({
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "postgres://secret-user:secret-pass@example.test/db",
        ATTN_INGEST_TOKEN: "server-secret",
        APP_BASE_URL: "https://attn.example.com",
        NEXT_PUBLIC_APP_BASE_URL: "https://attn.example.com",
        SLACK_WEBHOOK_URL: "https://hooks.slack.example/secret",
        NOVU_SECRET_KEY: "novu-secret",
        NOVU_WORKFLOW_ID: "workflow-id",
        ATTN_DEFAULT_SUBSCRIBER_EXTERNAL_ID: "attn-operator"
      } as NodeJS.ProcessEnv,
      now: () => new Date("2026-06-25T12:00:00.000Z"),
      checks: {
        checkDatabase: async () => undefined,
        defaultSubscriberExists: async () => true,
        activeDeviceCount: async () => 2,
        recentDeliveryCounts: async () => ({
          sent: 3,
          skipped: 4
        })
      }
    });

    expect(payload).toEqual({
      ok: true,
      timestamp: "2026-06-25T12:00:00.000Z",
      database: "ok",
      config: {
        app_base_url: true,
        next_public_app_base_url: true,
        slack_configured: true,
        novu_configured: true,
        novu_dry_run: false
      },
      default_subscriber: {
        external_id: "attn-operator",
        exists: true
      },
      devices: {
        active_count: 2
      },
      deliveries: {
        recent_by_status: {
          sent: 3,
          skipped: 4
        }
      }
    });
    expect(JSON.stringify(payload)).not.toContain("server-secret");
    expect(JSON.stringify(payload)).not.toContain("novu-secret");
    expect(JSON.stringify(payload)).not.toContain("secret-pass");
    expect(JSON.stringify(payload)).not.toContain(fakeExpoToken);
  });

  it("keeps diagnostics protected by the admin token", async () => {
    const originalToken = process.env.ATTN_INGEST_TOKEN;
    process.env.ATTN_INGEST_TOKEN = "diagnostics-secret";

    try {
      const response = await getDiagnosticsRoute(
        new NextRequest("http://localhost:3999/api/diagnostics")
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Unauthorized"
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.ATTN_INGEST_TOKEN;
      } else {
        process.env.ATTN_INGEST_TOKEN = originalToken;
      }
    }
  });

  it("reports env readiness without exposing configured values", () => {
    const report = getEnvReport(
      {
        NODE_ENV: "test",
        DATABASE_URL: "postgres://secret-user:secret-pass@example.test/db",
        ATTN_INGEST_TOKEN: "server-secret",
        APP_BASE_URL: "https://attn.example.com",
        NEXT_PUBLIC_APP_BASE_URL: "https://attn.example.com",
        SLACK_WEBHOOK_URL: "https://hooks.slack.example/secret",
        NOVU_SECRET_KEY: "novu-secret",
        NOVU_WORKFLOW_ID: "workflow-id",
        NOVU_DRY_RUN: "true",
        EXPO_PUBLIC_ATTN_BACKEND_URL: "https://attn.example.com"
      } as NodeJS.ProcessEnv,
      "all"
    );
    const output = formatEnvReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain("Required web runtime");
    expect(output).toContain("server-only secret");
    expect(output).toContain("Mobile public");
    expect(output).not.toContain("server-secret");
    expect(output).not.toContain("novu-secret");
    expect(output).not.toContain("secret-pass");
    expect(output).not.toContain("hooks.slack.example");
  });

  it("identifies missing required web runtime env separately from optional integrations", () => {
    const report = getEnvReport(
      {
        NODE_ENV: "test",
        NOVU_SECRET_KEY: "optional-secret"
      } as NodeJS.ProcessEnv,
      "web"
    );

    expect(report.ok).toBe(false);
    expect(report.missingRequired).toEqual([
      "DATABASE_URL",
      "ATTN_INGEST_TOKEN",
      "APP_BASE_URL",
      "NEXT_PUBLIC_APP_BASE_URL"
    ]);
    expect(
      report.checks.find((check) => check.name === "NOVU_SECRET_KEY")
    ).toMatchObject({
      group: "optional_integrations",
      required: false,
      present: true,
      exposure: "server-only secret"
    });
  });

  it("supports deterministic Novu dry-run responses", async () => {
    const result = await sendNovuNotification(
      {
        ...input(),
        id: randomUUID(),
        source: "vercel",
        external_id: null,
        dedupe_key: null,
        schema_version: "1",
        kind: "error",
        priority: "high",
        status: "new",
        title: "Production deployment failed",
        summary: "Build failed during production deployment.",
        detail: null,
        why_it_matters: null,
        suggested_action: null,
        source_url: null,
        related_run_id: null,
        related_task_id: null,
        payload_json: {},
        snoozed_until: null,
        occurred_at: "2026-06-25T12:00:00.000Z",
        created_at: "2026-06-25T12:00:00.000Z",
        updated_at: "2026-06-25T12:00:00.000Z"
      },
      {
        NODE_ENV: "test",
        NOVU_DRY_RUN: "true",
        NOVU_SECRET_KEY: "unused-secret",
        NOVU_WORKFLOW_ID: "workflow-id",
        NOVU_SUBSCRIBER_ID: "novu-human",
        APP_BASE_URL: "https://attn.example.com"
      } as NodeJS.ProcessEnv
    );

    expect(result).toEqual({
      status: "skipped",
      metadata: {
        reason: "novu_dry_run",
        subscriberId: "novu-human",
        workflowId: "workflow-id"
      }
    });
  });

  it("marks sent deliveries with sent_at", async () => {
    const repository = new MemoryNotificationRepository();

    await ingestNotification(input(), {
      repository,
      env: {
        ...process.env,
        SLACK_WEBHOOK_URL: "https://slack.example.test/webhook"
      },
      sendSlack: async () => ({ status: "sent", metadata: { status: 200 } }),
      sendNovu: skipped
    });

    expect(repository.deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: "in_app",
          status: "sent",
          sent_at: expect.any(String)
        }),
        expect.objectContaining({
          channel: "slack",
          status: "sent",
          sent_at: expect.any(String)
        })
      ])
    );
  });

  it("builds smoke payloads with only fake device tokens", () => {
    expect(buildSmokeNotificationPayload("abc")).toMatchObject({
      source: "smoke",
      external_id: "abc",
      dedupe_key: "smoke:abc"
    });
    expect(buildPairPayload("ABCD-EFGH")).toEqual({
      pairing_code: "ABCD-EFGH",
      device_name: "Smoke test device",
      metadata: {
        source: "smoke:e2e"
      }
    });
    expect(buildSmokeRegisterDevicePayload()).toEqual({
      platform: "expo",
      provider: "expo",
      device_token: fakeExpoToken,
      device_name: "Smoke test device",
      metadata: {
        source: "smoke:e2e"
      }
    });
    expect(buildUnregisterDevicePayload()).toEqual({
      provider: "expo",
      device_token: fakeExpoToken
    });
  });

  it("redacts smoke helper output and reports missing config clearly", () => {
    expect(
      redactSmokeText("Authorization: Bearer secret-token", ["secret-token"])
    ).toBe("Authorization: Bearer [redacted]");
    expect(redactSmokeText("pairing ABCD-EFGH", ["ABCD-EFGH"])).toBe(
      "pairing [redacted]"
    );
    expect(() => requireSmokeConfig({} as NodeJS.ProcessEnv)).toThrow(
      /Missing smoke:e2e environment: ATTN_BASE_URL, ATTN_INGEST_TOKEN/
    );
  });
});
