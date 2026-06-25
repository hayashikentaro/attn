import {
  acknowledgeNotification,
  createNotification,
  getPostgresNotificationRepository,
  resolveNotification,
  snoozeNotification
} from "@/lib/notifications";
import { getSql } from "@/lib/db";

const repository = getPostgresNotificationRepository();
const skipIntegrations = async () => ({ status: "skipped" as const });
const now = new Date();

async function seed() {
  const failedDeployment = await createNotification(
    {
      source: "vercel",
      kind: "error",
      priority: "high",
      title: "Production deployment failed",
      summary: "Build failed during production deployment.",
      detail: "The production deployment stopped during the build step.",
      why_it_matters: "Production remains on the previous version.",
      suggested_action: "Open the deployment logs and inspect the build error.",
      source_url: "https://vercel.com/example",
      occurred_at: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
      payload_json: {
        environment: "production",
        deploymentId: "dpl_prod_failed"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );

  await acknowledgeNotification(failedDeployment.id, { repository });

  await createNotification(
    {
      source: "vercel",
      kind: "info",
      priority: "normal",
      title: "Preview deployment ready",
      summary: "The preview deployment for the feature branch is available.",
      suggested_action: "Open the preview URL if you need to inspect it.",
      source_url: "https://vercel.com/example-preview",
      occurred_at: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
      payload_json: {
        environment: "preview",
        deploymentId: "dpl_preview_ready"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );

  await createNotification(
    {
      source: "agent",
      kind: "checkpoint",
      priority: "critical",
      title: "Agent checkpoint reached",
      summary: "The agent needs approval before applying database changes.",
      detail: "A migration has been generated and awaits human review.",
      why_it_matters: "The next step changes persisted data shape.",
      suggested_action: "Review the migration and approve or suspend the run.",
      related_run_id: "run_demo_checkpoint",
      related_task_id: "task_demo_attn",
      occurred_at: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
      payload_json: {
        checkpoint: "before_database_migration"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );

  await createNotification(
    {
      source: "system",
      kind: "info",
      priority: "low",
      title: "Daily sync completed",
      summary: "Background synchronization completed without errors.",
      occurred_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      payload_json: {
        job: "daily_sync"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );

  const snoozed = await createNotification(
    {
      source: "taskdeck",
      kind: "decision_request",
      priority: "normal",
      title: "Review UX copy later",
      summary: "A copy decision has been snoozed until later today.",
      suggested_action: "Choose whether the operator-facing copy is clear.",
      occurred_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      payload_json: {
        decision: "copy_review"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );
  await snoozeNotification(snoozed.id, { minutes: 180 }, { repository });

  const resolved = await createNotification(
    {
      source: "manual",
      kind: "warning",
      priority: "normal",
      title: "Resolved deploy warning",
      summary: "A deploy warning was reviewed and marked done.",
      occurred_at: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      payload_json: {
        warning: "demo_resolved"
      }
    },
    { repository, sendSlack: skipIntegrations, sendNovu: skipIntegrations }
  );
  await resolveNotification(resolved.id, { repository });
}

seed()
  .then(async () => {
    await getSql().end({ timeout: 5 });
    console.log("Seeded Attn demo notifications.");
  })
  .catch(async (error) => {
    await getSql().end({ timeout: 5 }).catch(() => undefined);
    console.error(error);
    process.exitCode = 1;
  });
