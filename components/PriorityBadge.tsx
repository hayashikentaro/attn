import type { NotificationPriority } from "@/lib/validation";

const priorityStyles: Record<NotificationPriority, string> = {
  low: "border-zinc-300 bg-zinc-50 text-zinc-700",
  normal: "border-sky-200 bg-sky-50 text-sky-800",
  high: "border-amber-300 bg-amber-50 text-amber-900",
  critical: "border-red-300 bg-red-50 text-red-800"
};

export function PriorityBadge({
  priority
}: {
  priority: NotificationPriority;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold uppercase ${priorityStyles[priority]}`}
    >
      {priority}
    </span>
  );
}
