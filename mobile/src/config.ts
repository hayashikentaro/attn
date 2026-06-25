import Constants from "expo-constants";
import { normalizeBackendUrl } from "./lib/backend";

interface ExpoExtra {
  attnBackendUrl?: string;
  attnTestItemUrl?: string;
  expoProjectId?: string;
}

function getExtra() {
  return (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
}

export function getMobileConfig() {
  const extra = getExtra();
  const backendUrl = normalizeBackendUrl(
    process.env.EXPO_PUBLIC_ATTN_BACKEND_URL || extra.attnBackendUrl
  );

  return {
    backendUrl,
    testItemUrl:
      process.env.EXPO_PUBLIC_ATTN_TEST_ITEM_URL ||
      extra.attnTestItemUrl ||
      null,
    expoProjectId:
      process.env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
      extra.expoProjectId ||
      Constants.expoConfig?.extra?.eas?.projectId ||
      null
  };
}
