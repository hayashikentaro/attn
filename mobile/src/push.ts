import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

export interface PushTokenResult {
  status: "granted" | "denied" | "unavailable";
  token?: string;
  message: string;
}

export async function requestExpoPushToken(projectId?: string | null): Promise<PushTokenResult> {
  if (!Device.isDevice) {
    return {
      status: "unavailable",
      message: "Push tokens require a physical device."
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return {
      status: "denied",
      message: "Notification permission was not granted."
    };
  }

  const result = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  return {
    status: "granted",
    token: result.data,
    message: "Expo push token acquired."
  };
}
