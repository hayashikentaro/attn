import { Linking } from "react-native";
import { resolveItemUrlFromPayload, type AttnNotificationPayload } from "./lib/deepLinks";

export async function openAttnItemFromPayload(
  payload: AttnNotificationPayload,
  backendUrl: string | null | undefined
) {
  const itemUrl = resolveItemUrlFromPayload(payload, backendUrl);
  if (!itemUrl) {
    return false;
  }

  await Linking.openURL(itemUrl);
  return true;
}
