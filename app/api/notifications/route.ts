import { NextRequest, NextResponse } from "next/server";
import { isIngestAuthorized } from "@/lib/auth";
import { ingestNotification, listNotifications } from "@/lib/notifications";
import {
  createNotificationInputSchema,
  formatValidationError,
  listNotificationsQuerySchema
} from "@/lib/validation";

const maxIngestBodyBytes = 64 * 1024;

export async function GET(request: NextRequest) {
  const parsed = listNotificationsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const notifications = await listNotifications(parsed.data);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json(
      { error: "Unable to list notifications" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isIngestAuthorized(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    const contentLength = request.headers.get("content-length");
    if (
      contentLength &&
      Number.isFinite(Number(contentLength)) &&
      Number(contentLength) > maxIngestBodyBytes
    ) {
      return NextResponse.json(
        { error: "Request body is too large" },
        { status: 413 }
      );
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxIngestBodyBytes) {
      return NextResponse.json(
        { error: "Request body is too large" },
        { status: 413 }
      );
    }

    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createNotificationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const result = await ingestNotification(parsed.data);
    return NextResponse.json(result, {
      status: result.duplicated ? 200 : 201
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to ingest notification" },
      { status: 500 }
    );
  }
}
