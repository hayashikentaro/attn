import type { IntegrationResult, NotificationRecord } from "@/lib/notifications";
import { toSafeErrorMetadata } from "@/lib/slack";
import { getDefaultNovuSubscriberId } from "@/lib/subscribers";

export interface NovuNotificationPayload {
  subscriberId: string;
  notificationId: string;
  title: string;
  summary: string;
  priority: string;
  itemUrl: string | null;
  payload: Record<string, unknown>;
}

function getItemUrl(notification: NotificationRecord, env: NodeJS.ProcessEnv) {
  const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl.replace(/\/$/, "")}/items/${notification.id}`;
}

export function buildNovuNotificationPayload(
  notification: NotificationRecord,
  env = process.env
): NovuNotificationPayload {
  return {
    subscriberId: getDefaultNovuSubscriberId(env),
    notificationId: notification.id,
    title: notification.title,
    summary: notification.summary,
    priority: notification.priority,
    itemUrl: getItemUrl(notification, env),
    payload: {
      source: notification.source,
      kind: notification.kind,
      sourceUrl: notification.source_url,
      relatedRunId: notification.related_run_id,
      relatedTaskId: notification.related_task_id,
      originalPayload: notification.payload_json
    }
  };
}

export async function sendNovuNotification(
  notification: NotificationRecord,
  env = process.env
): Promise<IntegrationResult> {
  const secretKey = env.NOVU_SECRET_KEY;
  const workflowId = env.NOVU_WORKFLOW_ID;
  const payload = buildNovuNotificationPayload(notification, env);

  if (env.NOVU_DRY_RUN === "true") {
    return {
      status: "skipped",
      metadata: {
        reason: "novu_dry_run",
        subscriberId: payload.subscriberId,
        workflowId: workflowId || null
      }
    };
  }

  if (!secretKey || !workflowId) {
    return {
      status: "skipped",
      metadata: {
        reason: "novu_not_configured"
      }
    };
  }

  try {
    const response = await fetch("https://api.novu.co/v1/events/trigger", {
      method: "POST",
      headers: {
        Authorization: `ApiKey ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: workflowId,
        to: {
          subscriberId: payload.subscriberId
        },
        payload: {
          notificationId: payload.notificationId,
          title: payload.title,
          summary: payload.summary,
          priority: payload.priority,
          itemUrl: payload.itemUrl,
          ...payload.payload
        }
      })
    });

    if (!response.ok) {
      return {
        status: "failed",
        metadata: {
          status: response.status,
          statusText: response.statusText
        }
      };
    }

    return {
      status: "sent",
      metadata: {
        status: response.status,
        workflowId,
        subscriberId: payload.subscriberId
      }
    };
  } catch (error) {
    return {
      status: "failed",
      metadata: toSafeErrorMetadata(error)
    };
  }
}

export async function updateNovuSubscriberCredentials(
  _input: {
    novu_subscriber_id: string;
    provider: "expo" | "fcm" | "apns" | "web_push";
    device_token_hash: string;
  },
  env = process.env
) {
  if (!env.NOVU_SECRET_KEY) {
    return { status: "skipped" as const };
  }

  return {
    status: "skipped" as const,
    metadata: {
      reason: "novu_device_credentials_not_implemented"
    }
  };
}
