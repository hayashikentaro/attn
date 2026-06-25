import { NextRequest, NextResponse } from "next/server";
import { recordDecision } from "@/lib/notifications";
import {
  decisionInputSchema,
  formatValidationError,
  notificationIdSchema
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

  const parsedBody = decisionInputSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(formatValidationError(parsedBody.error), {
      status: 400
    });
  }

  const event = await recordDecision(parsedId.data, parsedBody.data);
  return NextResponse.json({ event }, { status: 201 });
}
