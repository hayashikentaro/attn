import { NextRequest, NextResponse } from "next/server";
import { acknowledgeNotification } from "@/lib/notifications";
import { formatValidationError, notificationIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const parsed = notificationIdSchema.safeParse(id);

  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  const notification = await acknowledgeNotification(parsed.data);
  if (!notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  return NextResponse.json({ notification });
}
