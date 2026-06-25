import { formatAbsoluteDateTime, formatRelativeDateTime } from "@/lib/time";
import type {
  NotificationDeliveryRecord,
  NotificationEventRecord
} from "@/lib/notifications";

export function DeliveryHistory({
  deliveries
}: {
  deliveries: NotificationDeliveryRecord[];
}) {
  return (
    <div className="space-y-3">
      {deliveries.length > 0 ? (
        deliveries.map((delivery) => (
          <div
            className="rounded-lg border border-zinc-200 bg-white p-4"
            key={delivery.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-900">
                  {delivery.channel}
                </span>
                <span className="text-sm text-zinc-600">
                  {delivery.provider} / {delivery.status}
                </span>
              </div>
              <time
                className="text-sm text-zinc-500"
                dateTime={delivery.updated_at}
                title={formatAbsoluteDateTime(delivery.updated_at)}
              >
                {formatRelativeDateTime(delivery.updated_at)}
              </time>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Attempts: {delivery.attempts}
              {delivery.last_error ? ` / ${delivery.last_error}` : ""}
              {delivery.sent_at
                ? ` / sent ${formatAbsoluteDateTime(delivery.sent_at)}`
                : ""}
            </p>
            {Object.keys(delivery.metadata_json).length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                  Metadata
                </summary>
                <pre className="mt-2 rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
                  {JSON.stringify(delivery.metadata_json, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
          No deliveries have been recorded yet.
        </div>
      )}
    </div>
  );
}

export function EventHistory({ events }: { events: NotificationEventRecord[] }) {
  return (
    <div className="space-y-3">
      {events.length > 0 ? (
        events.map((event) => (
          <div
            className="rounded-lg border border-zinc-200 bg-white p-4"
            key={event.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-100 px-2 py-1 text-sm font-semibold text-zinc-900">
                  {event.event_type}
                </span>
                <span className="text-sm text-zinc-600">by {event.actor}</span>
              </div>
              <time
                className="text-sm text-zinc-500"
                dateTime={event.created_at}
                title={formatAbsoluteDateTime(event.created_at)}
              >
                {formatRelativeDateTime(event.created_at)}
              </time>
            </div>
            {Object.keys(event.metadata_json).length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                  Metadata
                </summary>
                <pre className="mt-2 rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
                  {JSON.stringify(event.metadata_json, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
          No events have been recorded yet.
        </div>
      )}
    </div>
  );
}
