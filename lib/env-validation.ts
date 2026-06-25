export type EnvTarget = "web" | "mobile" | "all";

type EnvGroup = "required_web" | "optional_integrations" | "mobile_public";

interface EnvDefinition {
  name: string;
  group: EnvGroup;
  requiredFor: EnvTarget[];
  exposure: "server-only secret" | "server runtime" | "public web" | "public mobile";
  note: string;
}

export interface EnvCheck {
  name: string;
  group: EnvGroup;
  required: boolean;
  present: boolean;
  exposure: EnvDefinition["exposure"];
  note: string;
}

export interface EnvReport {
  target: EnvTarget;
  checks: EnvCheck[];
  ok: boolean;
  missingRequired: string[];
}

const definitions: EnvDefinition[] = [
  {
    name: "DATABASE_URL",
    group: "required_web",
    requiredFor: ["web", "all"],
    exposure: "server-only secret",
    note: "Postgres connection string for the backend."
  },
  {
    name: "ATTN_INGEST_TOKEN",
    group: "required_web",
    requiredFor: ["web", "all"],
    exposure: "server-only secret",
    note: "Admin/ingest token for protected backend endpoints."
  },
  {
    name: "APP_BASE_URL",
    group: "required_web",
    requiredFor: ["web", "all"],
    exposure: "server runtime",
    note: "Canonical backend URL used by server-side integrations."
  },
  {
    name: "NEXT_PUBLIC_APP_BASE_URL",
    group: "required_web",
    requiredFor: ["web", "all"],
    exposure: "public web",
    note: "Public web URL bundled for client-side links."
  },
  {
    name: "SLACK_WEBHOOK_URL",
    group: "optional_integrations",
    requiredFor: [],
    exposure: "server-only secret",
    note: "Optional Slack delivery webhook."
  },
  {
    name: "NOVU_SECRET_KEY",
    group: "optional_integrations",
    requiredFor: [],
    exposure: "server-only secret",
    note: "Optional Novu API key."
  },
  {
    name: "NOVU_WORKFLOW_ID",
    group: "optional_integrations",
    requiredFor: [],
    exposure: "server runtime",
    note: "Optional Novu workflow identifier."
  },
  {
    name: "NOVU_DRY_RUN",
    group: "optional_integrations",
    requiredFor: [],
    exposure: "server runtime",
    note: "Optional deterministic Novu dry-run switch."
  },
  {
    name: "EXPO_PUBLIC_ATTN_BACKEND_URL",
    group: "mobile_public",
    requiredFor: ["mobile", "all"],
    exposure: "public mobile",
    note: "Public backend URL bundled into the Expo app."
  }
];

export function getEnvChecks(
  env: NodeJS.ProcessEnv = process.env,
  target: EnvTarget = "all"
): EnvCheck[] {
  return definitions.map((definition) => {
    const required = definition.requiredFor.includes(target);
    return {
      name: definition.name,
      group: definition.group,
      required,
      present: Boolean(env[definition.name]),
      exposure: definition.exposure,
      note: definition.note
    };
  });
}

export function getEnvReport(
  env: NodeJS.ProcessEnv = process.env,
  target: EnvTarget = "all"
): EnvReport {
  const checks = getEnvChecks(env, target);
  const missingRequired = checks
    .filter((check) => check.required && !check.present)
    .map((check) => check.name);

  return {
    target,
    checks,
    ok: missingRequired.length === 0,
    missingRequired
  };
}

function labelGroup(group: EnvGroup) {
  switch (group) {
    case "required_web":
      return "Required web runtime";
    case "optional_integrations":
      return "Optional integrations";
    case "mobile_public":
      return "Mobile public";
  }
}

export function formatEnvReport(report: EnvReport) {
  const lines = [
    `Environment readiness target: ${report.target}`,
    `Status: ${report.ok ? "ready" : "missing required values"}`,
    ""
  ];

  for (const group of [
    "required_web",
    "optional_integrations",
    "mobile_public"
  ] satisfies EnvGroup[]) {
    lines.push(`${labelGroup(group)}:`);
    for (const check of report.checks.filter((item) => item.group === group)) {
      const status = check.present ? "set" : check.required ? "missing" : "unset";
      const required = check.required ? "required" : "optional";
      lines.push(
        `- ${check.name}: ${status} (${required}, ${check.exposure})`
      );
    }
    lines.push("");
  }

  if (report.missingRequired.length > 0) {
    lines.push(`Missing required: ${report.missingRequired.join(", ")}`);
    lines.push("No secret values were printed.");
  } else {
    lines.push("No required values are missing. No secret values were printed.");
  }

  return lines.join("\n");
}

export function parseEnvTarget(value: string | undefined): EnvTarget {
  if (value === "web" || value === "mobile" || value === "all") {
    return value;
  }

  return "all";
}
