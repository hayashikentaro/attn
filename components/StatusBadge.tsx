import type { NotificationStatus } from "@/lib/validation";

const statusStyles: Record<NotificationStatus, string> = {
  new: "border-cyan-200 bg-cyan-50 text-cyan-800",
  seen: "border-zinc-300 bg-zinc-50 text-zinc-700",
  acknowledged: "border-blue-200 bg-blue-50 text-blue-800",
  snoozed: "border-purple-200 bg-purple-50 text-purple-800",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800"
};

export function StatusBadge({ status }: { status: NotificationStatus }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium ${statusStyles[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
