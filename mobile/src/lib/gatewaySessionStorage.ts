export interface GatewayMobileSession {
  session_token: string;
  refresh_token?: string;
  expires_at?: string;
  gateway_origin?: string;
  subject_label?: string;
}

export interface GatewaySessionStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const gatewayMobileSessionStorageKey =
  "attn.gateway.mobileSession.v1";

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

export async function saveGatewayMobileSession(
  session: GatewayMobileSession,
  storage: GatewaySessionStorage = secureStoreStorage
) {
  const normalized = normalizeGatewayMobileSession(session);
  if (!normalized) {
    throw new Error("Invalid gateway mobile session");
  }

  await storage.setItemAsync(
    gatewayMobileSessionStorageKey,
    JSON.stringify(normalized)
  );
}

export async function loadGatewayMobileSession(
  storage: GatewaySessionStorage = secureStoreStorage
): Promise<GatewayMobileSession | null> {
  const rawValue = await storage.getItemAsync(gatewayMobileSessionStorageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return normalizeGatewayMobileSession(JSON.parse(rawValue) as unknown);
  } catch {
    return null;
  }
}

export async function clearGatewayMobileSession(
  storage: GatewaySessionStorage = secureStoreStorage
) {
  await storage.deleteItemAsync(gatewayMobileSessionStorageKey);
}

function normalizeGatewayMobileSession(
  value: unknown
): GatewayMobileSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const sessionToken = normalizeOptionalString(source.session_token);
  if (!sessionToken) {
    return null;
  }

  return {
    session_token: sessionToken,
    ...optionalField("refresh_token", source.refresh_token),
    ...optionalField("expires_at", source.expires_at),
    ...optionalField("gateway_origin", source.gateway_origin),
    ...optionalField("subject_label", source.subject_label)
  };
}

function optionalField(key: keyof GatewayMobileSession, value: unknown) {
  const normalized = normalizeOptionalString(value);
  return normalized ? { [key]: normalized } : {};
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}
