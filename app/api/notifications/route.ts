import { NextRequest, NextResponse } from "next/server";
import { isIngestAuthorized } from "@/lib/auth";
import { createNotification, listNotifications } from "@/lib/notifications";
import {
  createNotificationInputSchema,
  formatValidationError,
  listNotificationsQuerySchema
} from "@/lib/validation";

export async function GET(request: NextRequest) {
  const parsed = listNotificationsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );

  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  const notifications = await listNotifications(parsed.data);
  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  if (!isIngestAuthorized(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createNotificationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  const notification = await createNotification(parsed.data);
  return NextResponse.json({ notification }, { status: 201 });
}
