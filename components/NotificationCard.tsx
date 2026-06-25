import Link from "next/link";
import { NotificationActions } from "@/components/NotificationActions";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelativeDateTime } from "@/lib/time";
import type { NotificationRecord } from "@/lib/notifications";

const priorityAccent: Record<NotificationRecord["priority"], string> = {
  low: "border-l-zinc-300",
  normal: "border-l-sky-400",
  high: "border-l-amber-500",
  critical: "border-l-red-600"
};

export function NotificationCard({
  notification
}: {
  notification: NotificationRecord;
}) {
  const prominent =
    notification.priority === "critical" || notification.priority === "high";

  return (
    <article
      className={`rounded-lg border border-zinc-200 border-l-4 bg-white p-4 shadow-sm ${priorityAccent[notification.priority]} ${
        prominent ? "shadow-md" : ""
      }`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={notification.priority} />
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700">
              {notification.source}
            </span>
            <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700">
              {notification.kind}
            </span>
            <StatusBadge status={notification.status} />
            <span className="text-xs font-medium text-zinc-500">
              {formatRelativeDateTime(notification.occurred_at)}
            </span>
          </div>

          <div className="space-y-1">
            <Link
              className="text-base font-semibold leading-tight text-zinc-950 hover:text-cyan-800"
              href={`/items/${notification.id}`}
            >
              {notification.title}
            </Link>
            <p className="text-sm leading-6 text-zinc-700">
              {notification.summary}
            </p>
          </div>
        </div>

        <NotificationActions notificationId={notification.id} mode="compact" />
      </div>
    </article>
  );
}
