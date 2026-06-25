"use client";

import {
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  MessageSquareMore,
  PauseCircle,
  RotateCcw,
  ThumbsUp,
  XCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { tomorrowAtNine } from "@/lib/time";
import type { DecisionValue } from "@/lib/validation";

type Icon = ComponentType<{ className?: string }>;

const decisionLabels: Array<{
  decision: DecisionValue;
  label: string;
  icon: Icon;
}> = [
  { decision: "approve", label: "Approve", icon: ThumbsUp },
  {
    decision: "approve_with_condition",
    label: "Approve with condition",
    icon: CheckCheck
  },
  { decision: "reject", label: "Reject", icon: XCircle },
  { decision: "ask_follow_up", label: "Ask follow-up", icon: MessageSquareMore },
  { decision: "suspend", label: "Suspend", icon: PauseCircle }
];

function ActionButton({
  label,
  icon: IconComponent,
  pending,
  onClick,
  tone = "default"
}: {
  label: string;
  icon: Icon;
  pending: boolean;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClasses =
    tone === "primary"
      ? "border-cyan-800 bg-cyan-800 text-white hover:bg-cyan-900"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
        : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50";

  return (
    <button
      className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${toneClasses}`}
      disabled={pending}
      onClick={onClick}
      title={label}
      type="button"
    >
      <IconComponent className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

export function NotificationActions({
  notificationId,
  mode = "compact",
  sourceUrl,
  showDecisionActions = false
}: {
  notificationId: string;
  mode?: "compact" | "detail";
  sourceUrl?: string | null;
  showDecisionActions?: boolean;
}) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function callAction(action: string, body?: Record<string, unknown>) {
    setPendingAction(action);
    setError(null);

    try {
      const response = await fetch(`/api/notifications/${notificationId}/${action}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Action failed with ${response.status}`);
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setPendingAction(null);
    }
  }

  async function recordDecision(decision: DecisionValue) {
    await callAction("decision", {
      decision,
      metadata: {}
    });
  }

  const pending = pendingAction !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "compact" ? (
          <Link
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            href={`/items/${notificationId}`}
            title="Open"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>Open</span>
          </Link>
        ) : null}
        <ActionButton
          icon={Check}
          label="Acknowledge"
          onClick={() => callAction("acknowledge")}
          pending={pending}
        />
        <ActionButton
          icon={Clock3}
          label={mode === "compact" ? "Snooze" : "Snooze 1 hour"}
          onClick={() => callAction("snooze", { minutes: 60 })}
          pending={pending}
        />
        {mode === "detail" ? (
          <ActionButton
            icon={Clock3}
            label="Snooze until tomorrow"
            onClick={() =>
              callAction("snooze", { until: tomorrowAtNine().toISOString() })
            }
            pending={pending}
          />
        ) : null}
        <ActionButton
          icon={CheckCheck}
          label={mode === "compact" ? "Done" : "Mark done"}
          onClick={() => callAction("resolve")}
          pending={pending}
          tone="primary"
        />
        {mode === "detail" ? (
          <ActionButton
            icon={RotateCcw}
            label="Reopen"
            onClick={() => callAction("reopen")}
            pending={pending}
          />
        ) : null}
        {mode === "detail" && sourceUrl ? (
          <a
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            href={sourceUrl}
            rel="noreferrer"
            target="_blank"
            title="Open source URL"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>Open source URL</span>
          </a>
        ) : null}
      </div>

      {showDecisionActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-2">
          {decisionLabels.map((decision) => (
            <ActionButton
              icon={decision.icon}
              key={decision.decision}
              label={decision.label}
              onClick={() => recordDecision(decision.decision)}
              pending={pending}
              tone={decision.decision === "reject" ? "danger" : "default"}
            />
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
