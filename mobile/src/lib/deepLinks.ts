import { normalizeBackendUrl } from "./backend";

export interface AttnNotificationPayload {
  notificationId?: unknown;
  itemUrl?: unknown;
}

export function resolveItemUrlFromPayload(
  payload: AttnNotificationPayload,
  backendUrl: string | null | undefined
) {
  if (typeof payload.itemUrl === "string" && payload.itemUrl.trim()) {
    return payload.itemUrl.trim();
  }

  if (typeof payload.notificationId !== "string" || !payload.notificationId.trim()) {
    return null;
  }

  const base = normalizeBackendUrl(backendUrl);
  if (!base) {
    return null;
  }

  return `${base}/items/${encodeURIComponent(payload.notificationId.trim())}`;
}
