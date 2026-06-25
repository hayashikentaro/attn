import { getSql } from "@/lib/db";
import { getDefaultSubscriberExternalId } from "@/lib/subscribers";

export interface DiagnosticsPayload {
  ok: boolean;
  timestamp: string;
  database: "ok" | "unavailable";
  config: {
    app_base_url: boolean;
    next_public_app_base_url: boolean;
    slack_configured: boolean;
    novu_configured: boolean;
    novu_dry_run: boolean;
  };
  default_subscriber: {
    external_id: string;
    exists: boolean;
  };
  devices: {
    active_count: number;
  };
  deliveries: {
    recent_by_status: Record<string, number>;
  };
}

export interface DiagnosticsChecks {
  checkDatabase: () => Promise<void>;
  defaultSubscriberExists: () => Promise<boolean>;
  activeDeviceCount: () => Promise<number>;
  recentDeliveryCounts: () => Promise<Record<string, number>>;
}

export function getDiagnosticsConfig(env = process.env) {
  return {
    app_base_url: Boolean(env.APP_BASE_URL),
    next_public_app_base_url: Boolean(env.NEXT_PUBLIC_APP_BASE_URL),
    slack_configured: Boolean(env.SLACK_WEBHOOK_URL),
    novu_configured: Boolean(env.NOVU_SECRET_KEY && env.NOVU_WORKFLOW_ID),
    novu_dry_run: env.NOVU_DRY_RUN === "true"
  };
}

export function getPostgresDiagnosticsChecks(
  env = process.env
): DiagnosticsChecks {
  return {
    async checkDatabase() {
      await getSql()`select 1`;
    },

    async defaultSubscriberExists() {
      const rows = (await getSql()`
        select id
        from subscribers
        where external_id = ${getDefaultSubscriberExternalId(env)}
        limit 1
      `) as unknown as unknown[];

      return rows.length > 0;
    },

    async activeDeviceCount() {
      const rows = (await getSql()`
        select count(*)::int as count
        from subscriber_devices
        where revoked_at is null
      `) as unknown as Array<{ count: number | string }>;

      return Number(rows[0]?.count ?? 0);
    },

    async recentDeliveryCounts() {
      const rows = (await getSql()`
        select status, count(*)::int as count
        from notification_deliveries
        where created_at > now() - interval '24 hours'
        group by status
      `) as unknown as Array<{ status: string; count: number | string }>;

      return Object.fromEntries(
        rows.map((row) => [row.status, Number(row.count)])
      );
    }
  };
}

export async function getDiagnosticsPayload(
  options: {
    checks?: DiagnosticsChecks;
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
  } = {}
): Promise<DiagnosticsPayload> {
  const env = options.env ?? process.env;
  const checks = options.checks ?? getPostgresDiagnosticsChecks(env);
  const timestamp = (options.now?.() ?? new Date()).toISOString();

  let database: DiagnosticsPayload["database"] = "unavailable";
  let defaultSubscriberExists = false;
  let activeDeviceCount = 0;
  let recentDeliveryCounts: Record<string, number> = {};

  try {
    await checks.checkDatabase();
    database = "ok";
    defaultSubscriberExists = await checks.defaultSubscriberExists();
    activeDeviceCount = await checks.activeDeviceCount();
    recentDeliveryCounts = await checks.recentDeliveryCounts();
  } catch {
    database = "unavailable";
  }

  return {
    ok: database === "ok",
    timestamp,
    database,
    config: getDiagnosticsConfig(env),
    default_subscriber: {
      external_id: getDefaultSubscriberExternalId(env),
      exists: defaultSubscriberExists
    },
    devices: {
      active_count: activeDeviceCount
    },
    deliveries: {
      recent_by_status: recentDeliveryCounts
    }
  };
}
