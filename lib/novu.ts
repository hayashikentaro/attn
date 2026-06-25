import type { IntegrationResult, NotificationRecord } from "@/lib/notifications";
import { toSafeErrorMetadata } from "@/lib/slack";

export async function sendNovuNotification(
  notification: NotificationRecord,
  env = process.env
): Promise<IntegrationResult> {
  const secretKey = env.NOVU_SECRET_KEY;
  const workflowId = env.NOVU_WORKFLOW_ID;

  if (!secretKey || !workflowId) {
    return { status: "skipped" };
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
          subscriberId: "attn-operator"
        },
        payload: {
          notificationId: notification.id,
          source: notification.source,
          kind: notification.kind,
          priority: notification.priority,
          title: notification.title,
          summary: notification.summary,
          sourceUrl: notification.source_url
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
        workflowId
      }
    };
  } catch (error) {
    return {
      status: "failed",
      metadata: toSafeErrorMetadata(error)
    };
  }
}
