import {
  parseGatewayNotificationPayload,
  type GatewayNotificationPayload
} from "./gatewayPayload";
import type { GatewaySessionStorage } from "./gatewaySessionStorage";

export type PendingGatewayDecisionIntent = GatewayNotificationPayload;

export const pendingGatewayDecisionIntentStorageKey =
  "attn.gateway.pendingDecisionIntent.v1";

const secureStoreStorage: GatewaySessionStorage = {
  async getItemAsync(key: string) {
    const secureStore = await import("expo-secure-store");
    return secureStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string) {
    const secureStore = await import("expo-secure-store");
    await secureStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key: string) {
    const secureStore = await import("expo-secure-store");
    await secureStore.deleteItemAsync(key);
  }
};

export async function savePendingGatewayDecisionIntent(
  intent: PendingGatewayDecisionIntent,
  gatewayBaseUrl: string | null | undefined,
  storage: GatewaySessionStorage = secureStoreStorage
) {
  const parsed = parseGatewayNotificationPayload(intent, gatewayBaseUrl);
  if (!parsed.ok) {
    throw new Error("Invalid pending gateway decision intent");
  }

  await storage.setItemAsync(
    pendingGatewayDecisionIntentStorageKey,
    JSON.stringify(parsed.payload)
  );
}

export async function loadPendingGatewayDecisionIntent(
  gatewayBaseUrl: string | null | undefined,
  storage: GatewaySessionStorage = secureStoreStorage
): Promise<PendingGatewayDecisionIntent | null> {
  const rawValue = await storage.getItemAsync(
    pendingGatewayDecisionIntentStorageKey
  );
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = parseGatewayNotificationPayload(
      JSON.parse(rawValue) as unknown,
      gatewayBaseUrl
    );
    return parsed.ok ? parsed.payload : null;
  } catch {
    return null;
  }
}

export async function clearPendingGatewayDecisionIntent(
  storage: GatewaySessionStorage = secureStoreStorage
) {
  await storage.deleteItemAsync(pendingGatewayDecisionIntentStorageKey);
}
