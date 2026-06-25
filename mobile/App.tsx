import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Notifications from "expo-notifications";
import { pairDevice, registerDevice, unregisterDevice } from "./src/api/attnClient";
import { exchangeGatewayPairingToken } from "./src/api/gatewayClient";
import { getMobileConfig } from "./src/config";
import { openAttnItemFromPayload } from "./src/openAttnItem";
import { requestExpoPushToken } from "./src/push";
import { savePendingGatewayDecisionIntent } from "./src/lib/gatewayPendingIntentStorage";
import { parseGatewayNotificationPayload } from "./src/lib/gatewayPayload";
import {
  loadGatewayMobileSession,
  saveGatewayMobileSession
} from "./src/lib/gatewaySessionStorage";
import { redactToken, tokenHashPreview } from "./src/lib/tokens";

type RegistrationState = "idle" | "working" | "registered" | "unregistered" | "failed";
type GatewaySessionState = "checking" | "missing" | "connected" | "failed";

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
  const [gatewayPairingCode, setGatewayPairingCode] = useState("");
  const [legacyPairingCode, setLegacyPairingCode] = useState("");
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);
  const [pairedSubscriberId, setPairedSubscriberId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState("not requested");
  const [gatewaySessionStatus, setGatewaySessionStatus] =
    useState<GatewaySessionState>("checking");
  const [gatewaySessionLabel, setGatewaySessionLabel] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] =
    useState<RegistrationState>("idle");
  const [message, setMessage] = useState("Ready for Gateway pairing.");

  useEffect(() => {
    let mounted = true;

    async function loadStoredGatewaySession() {
      const session = await loadGatewayMobileSession();
      if (!mounted) {
        return;
      }

      setGatewaySessionStatus(session ? "connected" : "missing");
      setGatewaySessionLabel(session?.subject_label ?? null);
    }

    void loadStoredGatewaySession().catch(() => {
      if (mounted) {
        setGatewaySessionStatus("failed");
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void handleNotificationResponse(response.notification.request.content.data);
      }
    );

    async function handleNotificationResponse(data: Record<string, unknown>) {
      const gatewayPayload = parseGatewayNotificationPayload(
        data,
        config.gatewayBaseUrl
      );

      if (gatewayPayload.ok) {
        try {
          await savePendingGatewayDecisionIntent(
            gatewayPayload.payload,
            config.gatewayBaseUrl
          );
          const session = await loadGatewayMobileSession();

          if (session) {
            setGatewaySessionStatus("connected");
            setGatewaySessionLabel(session.subject_label ?? null);
            setMessage("Gateway decision is ready for WebView.");
          } else {
            setGatewaySessionStatus("missing");
            setGatewaySessionLabel(null);
            setMessage("Gateway pairing required before opening this decision.");
          }
        } catch {
          setMessage("Unable to prepare Gateway decision.");
        }
        return;
      }

      const opened = await openAttnItemFromPayload(data, config.backendUrl);
      if (!opened) {
        setMessage("Notification did not include an openable item.");
      }
    }

    return () => subscription.remove();
  }, [config.backendUrl, config.gatewayBaseUrl]);

  async function requestPermission() {
    const result = await requestExpoPushToken(config.expoProjectId);
    setPermissionStatus(result.status);
    setMessage(result.message);

    if (result.token) {
      setPushToken(result.token);
    }
  }

  async function pairGatewaySession() {
    if (!gatewayPairingCode.trim()) {
      Alert.alert("Pairing code required", "Enter the Gateway pairing code.");
      return;
    }
    if (!config.gatewayBaseUrl) {
      Alert.alert(
        "Gateway URL missing",
        "Configure EXPO_PUBLIC_DECISION_GATEWAY_BASE_URL."
      );
      return;
    }

    setGatewaySessionStatus("checking");
    setMessage("Pairing this device with Decision Gateway.");

    try {
      const result = await exchangeGatewayPairingToken(config, {
        pairingToken: gatewayPairingCode,
        deviceName: "Attn mobile device",
        metadata: {
          app: "attn-mobile"
        }
      });

      await saveGatewayMobileSession(result.mobile_session);
      setGatewayPairingCode("");
      setGatewaySessionStatus("connected");
      setGatewaySessionLabel(result.mobile_session.subject_label ?? null);
      setMessage("Decision Gateway session connected.");
    } catch {
      setGatewaySessionStatus("failed");
      setMessage("Gateway pairing failed.");
    }
  }

  async function pairLegacyAttnDevice() {
    if (!legacyPairingCode.trim()) {
      Alert.alert("Pairing code required", "Enter the legacy Attn pairing code.");
      return;
    }

    setRegistrationStatus("working");
    setMessage("Pairing this device with legacy Attn registration.");

    try {
      const result = (await pairDevice(config, {
        pairingCode: legacyPairingCode,
        deviceName: "Attn mobile device",
        metadata: {
          app: "attn-mobile"
        }
      })) as {
        subscriber_id?: string;
        registration_token?: string;
      };

      if (!result.registration_token || !result.subscriber_id) {
        throw new Error("Pairing response was missing registration credentials.");
      }

      setRegistrationToken(result.registration_token);
      setPairedSubscriberId(result.subscriber_id);
      setRegistrationStatus("idle");
      setMessage("Legacy device paired. You can now register the push token.");
    } catch (error) {
      setRegistrationStatus("failed");
      setMessage(error instanceof Error ? error.message : "Pairing failed.");
    }
  }

  async function registerCurrentDevice() {
    if (!pushToken) {
      Alert.alert("No push token", "Request notification permission first.");
      return;
    }
    if (!registrationToken) {
      Alert.alert("Not paired", "Pair this device before registering it.");
      return;
    }

    setRegistrationStatus("working");
    setMessage("Registering this device with Attn.");

    try {
      const result = (await registerDevice(config, {
        deviceToken: pushToken,
        registrationToken,
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
    if (!registrationToken) {
      Alert.alert("Not paired", "Pair this device before unregistering it.");
      return;
    }

    setRegistrationStatus("working");
    setMessage("Unregistering this device.");

    try {
      await unregisterDevice(config, pushToken, registrationToken);
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
          <Text style={styles.label}>Gateway URL</Text>
          <Text style={styles.value}>{config.gatewayBaseUrl ?? "not configured"}</Text>
          <Text style={styles.label}>Gateway session</Text>
          <Text style={styles.value}>
            {gatewaySessionStatus === "connected"
              ? gatewaySessionLabel
                ? `connected as ${gatewaySessionLabel}`
                : "connected"
              : gatewaySessionStatus}
          </Text>
          <Text style={styles.label}>Permission</Text>
          <Text style={styles.value}>{permissionStatus}</Text>
          <Text style={styles.label}>Device registration</Text>
          <Text style={styles.value}>{registrationStatus}</Text>
          <Text style={styles.label}>Pairing</Text>
          <Text style={styles.value}>
            {registrationToken ? `paired to ${pairedSubscriberId}` : "not paired"}
          </Text>
          <Text style={styles.label}>Push token preview</Text>
          <Text style={styles.value}>{redactToken(pushToken)}</Text>
          <Text style={styles.label}>Registered token hash</Text>
          <Text style={styles.value}>{tokenHashPreview(registeredHash)}</Text>
        </View>

        <View style={styles.actions}>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setGatewayPairingCode}
            placeholder="Gateway pairing code"
            style={styles.input}
            value={gatewayPairingCode}
          />
          <Button
            disabled={!config.gatewayBaseUrl || gatewaySessionStatus === "checking"}
            label="Pair with Gateway"
            onPress={pairGatewaySession}
          />
          <Button label="Request notification permission" onPress={requestPermission} />
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setLegacyPairingCode}
            placeholder="Legacy Attn pairing code"
            style={styles.input}
            value={legacyPairingCode}
          />
          <Button
            disabled={!config.backendUrl || registrationStatus === "working"}
            label="Pair legacy Attn device"
            onPress={pairLegacyAttnDevice}
          />
          <Button
            disabled={
              !config.backendUrl ||
              !pushToken ||
              !registrationToken ||
              registrationStatus === "working"
            }
            label="Register device"
            onPress={registerCurrentDevice}
          />
          <Button
            disabled={
              !config.backendUrl ||
              !pushToken ||
              !registrationToken ||
              registrationStatus === "working"
            }
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
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d8d8d3",
    borderRadius: 8,
    borderWidth: 1,
    color: "#181818",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
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
