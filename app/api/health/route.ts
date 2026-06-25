import { NextResponse } from "next/server";
import { checkDatabaseConnection } from "@/lib/db";

export interface HealthPayload {
  app: "attn";
  ok: boolean;
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  timestamp: string;
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
    ok: databaseOk,
    status: databaseOk ? "ok" : "degraded",
    database: databaseOk ? "ok" : "unavailable",
    timestamp: now().toISOString()
  };
}

export async function GET() {
  const payload = await getHealthPayload();

  return NextResponse.json(payload, {
    status: payload.status === "ok" ? 200 : 503
  });
}
