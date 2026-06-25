import { NextRequest, NextResponse } from "next/server";
import { redactDevice, unregisterDevice } from "@/lib/devices";
import {
  formatValidationError,
  unregisterDeviceInputSchema
} from "@/lib/validation";

const maxDeviceBodyBytes = 32 * 1024;

async function readJsonBody(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > maxDeviceBodyBytes
  ) {
    return { error: "Request body is too large", status: 413 } as const;
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxDeviceBodyBytes) {
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

  const parsed = unregisterDeviceInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const device = await unregisterDevice(parsed.data);
    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    return NextResponse.json({ device: redactDevice(device) });
  } catch {
    return NextResponse.json(
      { error: "Unable to unregister device" },
      { status: 500 }
    );
  }
}
