import Constants from "expo-constants";
import { getMobilePublicConfig } from "./lib/publicEnv";

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
  return getMobilePublicConfig(process.env, {
    ...extra,
    easProjectId: Constants.expoConfig?.extra?.eas?.projectId
  });
}
