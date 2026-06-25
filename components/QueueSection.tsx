import { NotificationCard } from "@/components/NotificationCard";
import type { NotificationRecord } from "@/lib/notifications";

export function QueueSection({
  title,
  subtitle,
  notifications,
  emptyText
}: {
  title: string;
  subtitle: string;
  notifications: NotificationRecord[];
  emptyText: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-200 pb-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
          <p className="text-sm text-zinc-600">{subtitle}</p>
        </div>
        <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm font-semibold text-zinc-700">
          {notifications.length}
        </span>
      </div>

      {notifications.length > 0 ? (
        <div className="grid gap-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
          {emptyText}
        </div>
      )}
    </section>
  );
}
