import {
  buildPairingCodePayload,
  buildPairPayload,
  buildRegisterDevicePayload,
  buildSmokeNotificationPayload,
  buildUnregisterDevicePayload,
  requireSmokeConfig,
  redactSmokeValue
} from "./smoke-helpers";

interface JsonResponse {
  status: number;
  body: unknown;
}

async function requestJson(
  url: string,
  init: RequestInit = {}
): Promise<JsonResponse> {
  const response = await fetch(url, init);
  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(
      `Request failed ${response.status} ${url}: ${JSON.stringify(body)}`
    );
  }

  return {
    status: response.status,
    body
  };
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function readPath<T>(body: unknown, path: string[]): T {
  let current = body;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      throw new Error(`Missing response path: ${path.join(".")}`);
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current as T;
}

async function main() {
  const { baseUrl, ingestToken } = requireSmokeConfig();
  const runId = `smoke-${Date.now()}`;

  console.log(`Smoke target: ${baseUrl}`);

  const health = await requestJson(`${baseUrl}/api/health`);
  console.log(`health: ${health.status}`);

  const create = await requestJson(`${baseUrl}/api/notifications`, {
    method: "POST",
    headers: authHeaders(ingestToken),
    body: JSON.stringify(buildSmokeNotificationPayload(runId))
  });
  const notificationId = readPath<string>(create.body, ["notification", "id"]);
  console.log(`ingest: ${create.status} item=${notificationId}`);

  const duplicate = await requestJson(`${baseUrl}/api/notifications`, {
    method: "POST",
    headers: authHeaders(ingestToken),
    body: JSON.stringify(buildSmokeNotificationPayload(runId))
  });
  const duplicated = readPath<boolean>(duplicate.body, ["duplicated"]);
  if (!duplicated) {
    throw new Error("Expected duplicate ingest to return duplicated=true.");
  }
  console.log("dedupe: duplicated=true");

  const pairingCodeResponse = await requestJson(
    `${baseUrl}/api/devices/pairing-codes`,
    {
      method: "POST",
      headers: authHeaders(ingestToken),
      body: JSON.stringify(buildPairingCodePayload())
    }
  );
  const pairingCode = readPath<string>(pairingCodeResponse.body, ["pairing_code"]);
  console.log(`pairing code: ${redactSmokeValue(pairingCode)}`);

  const pair = await requestJson(`${baseUrl}/api/devices/pair`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildPairPayload(pairingCode))
  });
  const registrationToken = readPath<string>(pair.body, ["registration_token"]);
  console.log(`device token scope: ${redactSmokeValue(registrationToken)}`);

  const register = await requestJson(`${baseUrl}/api/devices/register`, {
    method: "POST",
    headers: authHeaders(registrationToken),
    body: JSON.stringify(buildRegisterDevicePayload())
  });
  const tokenHash = readPath<string>(register.body, ["device", "device_token_hash"]);
  console.log(`device registered hash=${redactSmokeValue(tokenHash)}`);

  const unregister = await requestJson(`${baseUrl}/api/devices/unregister`, {
    method: "POST",
    headers: authHeaders(registrationToken),
    body: JSON.stringify(buildUnregisterDevicePayload())
  });
  console.log(`device unregister: ${unregister.status}`);

  const highId = `${runId}-high`;
  const high = await requestJson(`${baseUrl}/api/notifications`, {
    method: "POST",
    headers: authHeaders(ingestToken),
    body: JSON.stringify(buildSmokeNotificationPayload(highId, "high"))
  });
  const highNotificationId = readPath<string>(high.body, ["notification", "id"]);
  const detail = await requestJson(
    `${baseUrl}/api/notifications/${highNotificationId}`
  );
  const deliveries = readPath<unknown[]>(detail.body, [
    "notification",
    "deliveries"
  ]);
  if (deliveries.length === 0) {
    throw new Error("Expected delivery records on high-priority smoke item.");
  }
  console.log(`deliveries: ${deliveries.length}`);

  const diagnostics = await requestJson(`${baseUrl}/api/diagnostics`, {
    headers: authHeaders(ingestToken)
  });
  console.log(`diagnostics: ${diagnostics.status}`);

  console.log("smoke:e2e passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
