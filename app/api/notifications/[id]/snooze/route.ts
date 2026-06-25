import { NextRequest, NextResponse } from "next/server";
import { snoozeNotification } from "@/lib/notifications";
import {
  formatValidationError,
  notificationIdSchema,
  snoozeInputSchema
} from "@/lib/validation";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = notificationIdSchema.safeParse(id);

  if (!parsedId.success) {
    return NextResponse.json(formatValidationError(parsedId.error), {
      status: 400
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = snoozeInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(formatValidationError(parsedBody.error), {
      status: 400
    });
  }

  const notification = await snoozeNotification(parsedId.data, parsedBody.data);
  if (!notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ notification });
}
