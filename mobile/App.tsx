import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Notifications from "expo-notifications";
import { registerDevice, unregisterDevice } from "./src/api/attnClient";
import { getMobileConfig } from "./src/config";
import { openAttnItemFromPayload } from "./src/openAttnItem";
import { requestExpoPushToken } from "./src/push";
import { redactToken, tokenHashPreview } from "./src/lib/tokens";

type RegistrationState = "idle" | "working" | "registered" | "unregistered" | "failed";

function Button({
  label,
  onPress,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.buttonDisabled : null]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const config = useMemo(() => getMobileConfig(), []);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [registeredHash, setRegisteredHash] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState("not requested");
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationState>("idle");
  const [message, setMessage] = useState("Ready for device registration.");

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void openAttnItemFromPayload(
          response.notification.request.content.data,
          config.backendUrl
        );
      }
    );

    return () => subscription.remove();
  }, [config.backendUrl]);

  async function requestPermission() {
    const result = await requestExpoPushToken(config.expoProjectId);
    setPermissionStatus(result.status);
    setMessage(result.message);

    if (result.token) {
      setPushToken(result.token);
    }
  }

  async function registerCurrentDevice() {
    if (!pushToken) {
      Alert.alert("No push token", "Request notification permission first.");
      return;
    }

    setRegistrationStatus("working");
    setMessage("Registering this device with Attn.");

    try {
      const result = (await registerDevice(config, {
        deviceToken: pushToken,
        deviceName: "Attn mobile device",
        metadata: {
          app: "attn-mobile"
        }
      })) as { device?: { device_token_hash?: string } };

      setRegisteredHash(result.device?.device_token_hash ?? null);
      setRegistrationStatus("registered");
      setMessage("Device registered with Attn.");
    } catch (error) {
      setRegistrationStatus("failed");
      setMessage(error instanceof Error ? error.message : "Registration failed.");
    }
  }

  async function unregisterCurrentDevice() {
    if (!pushToken) {
      Alert.alert("No push token", "A push token is needed to unregister by token.");
      return;
    }

    setRegistrationStatus("working");
    setMessage("Unregistering this device.");

    try {
      await unregisterDevice(config, pushToken);
      setRegisteredHash(null);
      setRegistrationStatus("unregistered");
      setMessage("Device unregistered.");
    } catch (error) {
      setRegistrationStatus("failed");
      setMessage(error instanceof Error ? error.message : "Unregister failed.");
    }
  }

  function openQueue() {
    if (!config.backendUrl) {
      Alert.alert("Backend URL missing", "Configure an Attn backend URL first.");
      return;
    }

    void Linking.openURL(`${config.backendUrl}/queue`);
  }

  function openTestItem() {
    if (!config.testItemUrl) {
      Alert.alert("No test item URL", "Configure EXPO_PUBLIC_ATTN_TEST_ITEM_URL.");
      return;
    }

    void Linking.openURL(config.testItemUrl);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Attn</Text>
        <Text style={styles.subtitle}>Mobile shell for future Push E2E testing</Text>

        <View style={styles.panel}>
          <Text style={styles.label}>Backend URL</Text>
          <Text style={styles.value}>{config.backendUrl ?? "not configured"}</Text>
          <Text style={styles.label}>Permission</Text>
          <Text style={styles.value}>{permissionStatus}</Text>
          <Text style={styles.label}>Device registration</Text>
          <Text style={styles.value}>{registrationStatus}</Text>
          <Text style={styles.label}>Push token preview</Text>
          <Text style={styles.value}>{redactToken(pushToken)}</Text>
          <Text style={styles.label}>Registered token hash</Text>
          <Text style={styles.value}>{tokenHashPreview(registeredHash)}</Text>
        </View>

        <View style={styles.actions}>
          <Button label="Request notification permission" onPress={requestPermission} />
          <Button
            disabled={!config.backendUrl || !pushToken || registrationStatus === "working"}
            label="Register device"
            onPress={registerCurrentDevice}
          />
          <Button
            disabled={!config.backendUrl || !pushToken || registrationStatus === "working"}
            label="Unregister device"
            onPress={unregisterCurrentDevice}
          />
          <Button disabled={!config.backendUrl} label="Open Attn Queue" onPress={openQueue} />
          <Button
            disabled={!config.testItemUrl}
            label="Open test item URL"
            onPress={openTestItem}
          />
        </View>

        <Text style={styles.message}>{message}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f5"
  },
  container: {
    gap: 18,
    padding: 24
  },
  title: {
    color: "#101010",
    fontSize: 36,
    fontWeight: "700"
  },
  subtitle: {
    color: "#525252",
    fontSize: 16,
    lineHeight: 22
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8d8d3",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 16
  },
  label: {
    color: "#6b6b68",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
    textTransform: "uppercase"
  },
  value: {
    color: "#181818",
    fontSize: 15,
    lineHeight: 22
  },
  actions: {
    gap: 10
  },
  button: {
    alignItems: "center",
    backgroundColor: "#0f766e",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  buttonDisabled: {
    backgroundColor: "#94a3b8"
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700"
  },
  message: {
    color: "#44403c",
    fontSize: 14,
    lineHeight: 20
  }
});
