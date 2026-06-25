import type { IntegrationResult, NotificationRecord } from "@/lib/notifications";

function getItemUrl(notification: NotificationRecord, env: NodeJS.ProcessEnv) {
  const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_BASE_URL;
  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl.replace(/\/$/, "")}/items/${notification.id}`;
}

function toSlackText(notification: NotificationRecord, env: NodeJS.ProcessEnv) {
  const lines = [
    `[Needs you] ${notification.title}`,
    `${notification.source} / ${notification.kind} / ${notification.priority}`,
    notification.summary
  ];

  const itemUrl = getItemUrl(notification, env);
  if (itemUrl) {
    lines.push(`Attn: ${itemUrl}`);
  }

  if (notification.source_url) {
    lines.push(`Source: ${notification.source_url}`);
  }

  return lines.join("\n");
}

export async function sendSlackNotification(
  notification: NotificationRecord,
  env = process.env
): Promise<IntegrationResult> {
  const webhookUrl = env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return { status: "skipped" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: toSlackText(notification, env)
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
        status: response.status
      }
    };
  } catch (error) {
    return {
      status: "failed",
      metadata: toSafeErrorMetadata(error)
    };
  }
}

export function toSafeErrorMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 500)
    };
  }

  return {
    message: "Unknown integration error"
  };
}
