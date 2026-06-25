import Link from "next/link";
import { notFound } from "next/navigation";
import { EventHistory } from "@/components/EventHistory";
import { NotificationActions } from "@/components/NotificationActions";
import { PriorityBadge } from "@/components/PriorityBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { getNotificationWithEvents } from "@/lib/notifications";
import { formatAbsoluteDateTime } from "@/lib/time";
import { notificationIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

interface ItemPageProps {
  params: Promise<{
    id: string;
  }>;
}

function SetupNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-10">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
        <h1 className="text-xl font-semibold">Attn needs a database</h1>
        <p className="mt-2 text-sm leading-6">
          Set `DATABASE_URL`, run the SQL migration in `supabase/migrations`, and
          restart the app.
        </p>
        <pre className="mt-4 rounded-md bg-amber-100 p-3 text-xs">{message}</pre>
      </div>
    </main>
  );
}

function DetailField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-2 text-sm leading-6 text-zinc-800">{children}</dd>
    </div>
  );
}

export default async function ItemPage({ params }: ItemPageProps) {
  const { id } = await params;
  const parsedId = notificationIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  let notification;

  try {
    notification = await getNotificationWithEvents(parsedId.data);
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  if (!notification) {
    notFound();
  }

  const showDecisionActions =
    notification.kind === "decision_request" ||
    notification.kind === "checkpoint";

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="mb-6">
          <Link
            className="text-sm font-semibold text-cyan-800 hover:text-cyan-950"
            href="/queue"
          >
            Back to queue
          </Link>
        </div>

        <header className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <PriorityBadge priority={notification.priority} />
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700">
                  {notification.source}
                </span>
                <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700">
                  {notification.kind}
                </span>
                <StatusBadge status={notification.status} />
              </div>
              <div>
                <h1 className="text-3xl font-semibold leading-tight text-zinc-950">
                  {notification.title}
                </h1>
                <p className="mt-3 max-w-3xl text-base leading-7 text-zinc-700">
                  {notification.summary}
                </p>
              </div>
            </div>
            <div className="text-sm text-zinc-600 md:text-right">
              <p>Occurred {formatAbsoluteDateTime(notification.occurred_at)}</p>
              <p>Updated {formatAbsoluteDateTime(notification.updated_at)}</p>
              {notification.snoozed_until ? (
                <p>Snoozed until {formatAbsoluteDateTime(notification.snoozed_until)}</p>
              ) : null}
            </div>
          </div>

          <div className="mt-5 border-t border-zinc-200 pt-5">
            <NotificationActions
              mode="detail"
              notificationId={notification.id}
              showDecisionActions={showDecisionActions}
              sourceUrl={notification.source_url}
            />
          </div>
        </header>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {notification.detail ? (
            <DetailField label="Detail">{notification.detail}</DetailField>
          ) : null}
          {notification.why_it_matters ? (
            <DetailField label="Why it matters">
              {notification.why_it_matters}
            </DetailField>
          ) : null}
          {notification.suggested_action ? (
            <DetailField label="Suggested action">
              {notification.suggested_action}
            </DetailField>
          ) : null}
          {notification.source_url ? (
            <DetailField label="Source URL">
              <a
                className="text-cyan-800 underline underline-offset-2"
                href={notification.source_url}
                rel="noreferrer"
                target="_blank"
              >
                {notification.source_url}
              </a>
            </DetailField>
          ) : null}
          {notification.related_run_id ? (
            <DetailField label="Related run ID">
              {notification.related_run_id}
            </DetailField>
          ) : null}
          {notification.related_task_id ? (
            <DetailField label="Related task ID">
              {notification.related_task_id}
            </DetailField>
          ) : null}
        </div>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-zinc-950">Raw payload</h2>
          <details className="rounded-lg border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-800">
              Show payload JSON
            </summary>
            <pre className="mt-3 rounded-md bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
              {JSON.stringify(notification.payload_json, null, 2)}
            </pre>
          </details>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold text-zinc-950">Action history</h2>
          <EventHistory events={notification.events} />
        </section>
      </div>
    </main>
  );
}
