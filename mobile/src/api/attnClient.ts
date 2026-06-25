import { joinBackendPath } from "../lib/backend";

export interface AttnMobileConfig {
  backendUrl: string | null;
}

export interface RegisterDeviceOptions {
  deviceToken: string;
  registrationToken: string;
  deviceName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PairDeviceOptions {
  pairingCode: string;
  deviceName?: string | null;
  metadata?: Record<string, unknown>;
}

export function buildPairDevicePayload(options: PairDeviceOptions) {
  return {
    pairing_code: options.pairingCode,
    device_name: options.deviceName || undefined,
    metadata: {
      app: "attn-mobile",
      ...(options.metadata ?? {})
    }
  };
}

export function buildRegisterDevicePayload(
  options: RegisterDeviceOptions
) {
  return {
    platform: "expo",
    provider: "expo",
    device_token: options.deviceToken,
    device_name: options.deviceName || undefined,
    metadata: {
      app: "attn-mobile",
      ...(options.metadata ?? {})
    }
  };
}

export function buildUnregisterDevicePayload(deviceToken: string) {
  return {
    provider: "expo",
    device_token: deviceToken
  };
}

async function parseSafeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function toSafeErrorMessage(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }

  return fallback;
}

export async function pairDevice(
  config: AttnMobileConfig,
  options: PairDeviceOptions
) {
  if (!config.backendUrl) {
    throw new Error("Attn backend URL is not configured.");
  }

  const response = await fetch(joinBackendPath(config.backendUrl, "/api/devices/pair"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildPairDevicePayload(options))
  });
  const body = await parseSafeJson(response);

  if (!response.ok) {
    throw new Error(toSafeErrorMessage(body, "Unable to pair device."));
  }

  return body;
}

export async function registerDevice(
  config: AttnMobileConfig,
  options: RegisterDeviceOptions
) {
  if (!config.backendUrl) {
    throw new Error("Attn backend URL is not configured.");
  }

  const response = await fetch(joinBackendPath(config.backendUrl, "/api/devices/register"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.registrationToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildRegisterDevicePayload(options))
  });
  const body = await parseSafeJson(response);

  if (!response.ok) {
    throw new Error(toSafeErrorMessage(body, "Unable to register device."));
  }

  return body;
}

export async function unregisterDevice(
  config: AttnMobileConfig,
  deviceToken: string,
  registrationToken: string
) {
  if (!config.backendUrl) {
    throw new Error("Attn backend URL is not configured.");
  }

  const response = await fetch(
    joinBackendPath(config.backendUrl, "/api/devices/unregister"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${registrationToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildUnregisterDevicePayload(deviceToken))
    }
  );
  const body = await parseSafeJson(response);

  if (!response.ok) {
    throw new Error(toSafeErrorMessage(body, "Unable to unregister device."));
  }

  return body;
}
