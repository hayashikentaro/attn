import { normalizeBackendUrl } from "./backend";

export interface MobilePublicExtra {
  attnBackendUrl?: string;
  attnTestItemUrl?: string;
  decisionGatewayBaseUrl?: string;
  expoProjectId?: string;
  easProjectId?: string;
}

export interface MobilePublicEnv {
  EXPO_PUBLIC_ATTN_BACKEND_URL?: string;
  EXPO_PUBLIC_ATTN_TEST_ITEM_URL?: string;
  EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL?: string;
  EXPO_PUBLIC_EXPO_PROJECT_ID?: string;
}

export function getMobilePublicConfig(
  env: MobilePublicEnv,
  extra: MobilePublicExtra
) {
  return {
    backendUrl: normalizeBackendUrl(
      env.EXPO_PUBLIC_ATTN_BACKEND_URL || extra.attnBackendUrl
    ),
    gatewayBaseUrl: normalizeBackendUrl(
      env.EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL ||
        extra.decisionGatewayBaseUrl
    ),
    testItemUrl:
      env.EXPO_PUBLIC_ATTN_TEST_ITEM_URL || extra.attnTestItemUrl || null,
    expoProjectId:
      env.EXPO_PUBLIC_EXPO_PROJECT_ID ||
      extra.expoProjectId ||
      extra.easProjectId ||
      null
  };
}
