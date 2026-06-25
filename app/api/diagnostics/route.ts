import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { getDiagnosticsPayload } from "@/lib/diagnostics";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getDiagnosticsPayload();

  return NextResponse.json(payload, {
    status: payload.ok ? 200 : 503
  });
}
