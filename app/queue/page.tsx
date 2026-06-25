import Link from "next/link";
import { QueueSection } from "@/components/QueueSection";
import { listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

async function loadQueue() {
  const [needsYou, later, done] = await Promise.all([
    listNotifications({ bucket: "needs_you", limit: 75 }),
    listNotifications({ bucket: "later", limit: 50 }),
    listNotifications({ bucket: "done", limit: 50 })
  ]);

  return { needsYou, later, done };
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

export default async function QueuePage() {
  let queue;

  try {
    queue = await loadQueue();
  } catch (error) {
    return (
      <SetupNotice
        message={error instanceof Error ? error.message : "Unknown database error"}
      />
    );
  }

  const total =
    queue.needsYou.length + queue.later.length + queue.done.length;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-zinc-200 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              className="text-sm font-semibold uppercase tracking-wide text-cyan-800"
              href="/queue"
            >
              Attn
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              Your queue for human decisions.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Stateful notifications for deployments, checkpoints, and anything
              that still needs attention.
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
            <p className="text-xs font-medium uppercase text-zinc-500">Items</p>
            <p className="text-2xl font-semibold text-zinc-950">{total}</p>
          </div>
        </header>

        <div className="grid gap-8">
          <QueueSection
            emptyText="Nothing is waiting for you."
            notifications={queue.needsYou}
            subtitle="New, acknowledged, and expired snoozes."
            title="Needs you"
          />
          <QueueSection
            emptyText="Nothing is snoozed for later."
            notifications={queue.later}
            subtitle="Snoozed items return here when their time arrives."
            title="Later"
          />
          <QueueSection
            emptyText="No resolved items yet."
            notifications={queue.done}
            subtitle="Recently resolved attention items."
            title="Done"
          />
        </div>
      </div>
    </main>
  );
}
