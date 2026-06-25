import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/auth";
import { createDevicePairingCode } from "@/lib/device-pairing";
import {
  createDevicePairingCodeInputSchema,
  formatValidationError
} from "@/lib/validation";

const maxPairingBodyBytes = 16 * 1024;

async function readJsonBody(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maxPairingBodyBytes
  ) {
    return { error: "Request body is too large", status: 413 } as const;
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxPairingBodyBytes) {
      return { error: "Request body is too large", status: 413 } as const;
    }

    return {
      body: rawBody.trim() ? (JSON.parse(rawBody) as unknown) : {}
    } as const;
  } catch {
    return { error: "Invalid JSON body", status: 400 } as const;
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) {
    return NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
  }

  const parsed = createDevicePairingCodeInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const result = await createDevicePairingCode(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create pairing code" },
      { status: 500 }
    );
  }
}
