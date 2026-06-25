import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, isAdminAuthorized } from "@/lib/auth";
import {
  DevicePairingError,
  verifyDeviceRegistrationToken
} from "@/lib/device-pairing";
import { registerDevice, redactDevice } from "@/lib/devices";
import {
  formatValidationError,
  registerDeviceInputSchema
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
  let subscriberId: string | undefined;
  const bearerToken = getBearerToken(request.headers);

  try {
    if (bearerToken) {
      const authorization = await verifyDeviceRegistrationToken(bearerToken);
      subscriberId = authorization.subscriber_id;
    } else if (!isAdminAuthorized(request.headers)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof DevicePairingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyResult = await readJsonBody(request);
  if ("error" in bodyResult) {
    return NextResponse.json(
      { error: bodyResult.error },
      { status: bodyResult.status }
    );
  }

  const parsed = registerDeviceInputSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    return NextResponse.json(formatValidationError(parsed.error), {
      status: 400
    });
  }

  try {
    const result = await registerDevice(parsed.data, {
      subscriberId
    });
    return NextResponse.json(
      {
        subscriber: {
          id: result.subscriber.id,
          external_id: result.subscriber.external_id,
          display_name: result.subscriber.display_name,
          email: result.subscriber.email,
          novu_subscriber_id: result.subscriber.novu_subscriber_id
        },
        device: redactDevice(result.device)
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to register device" },
      { status: 500 }
    );
  }
}
