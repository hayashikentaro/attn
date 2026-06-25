import { NextRequest, NextResponse } from "next/server";
import {
  DevicePairingError,
  exchangeDevicePairingCode
} from "@/lib/device-pairing";
import { formatValidationError, pairDeviceInputSchema } from "@/lib/validation";

const maxPairBodyBytes = 16 * 1024;

async function readJsonBody(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maxPairBodyBytes
  ) {
    return { error: "Request body is too large", status: 413 } as const;
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxPairBodyBytes) {
      return { error: "Request body is too large", status: 413 } as const;
    }

    return { body: JSON.parse(rawBody) as unknown } as const;
  } catch {
    return { error: "Invalid JSON body", status: 400 } as const;
  }
}

export async function POST(request: NextRequest) {
  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) {
    return NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
  }

  const parsed = pairDeviceInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const result = await exchangeDevicePairingCode(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DevicePairingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to pair device" }, { status: 500 });
  }
}
