import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";

export interface HealthPayload {
  app: "attn";
  status: "ok" | "degraded";
  checked_at: string;
  database: {
    ok: boolean;
  };
}

export async function getHealthPayload(
  checkDatabase = checkDatabaseConnection,
  now = () => new Date()
): Promise<HealthPayload> {
  let databaseOk = false;

  try {
    await checkDatabase();
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  return {
    app: "attn",
    status: databaseOk ? "ok" : "degraded",
    checked_at: now().toISOString(),
    database: {
      ok: databaseOk
    }
  };
}

export async function GET() {
  const payload = await getHealthPayload();

  return NextResponse.json(payload, {
    status: payload.status === "ok" ? 200 : 503
  });
}
