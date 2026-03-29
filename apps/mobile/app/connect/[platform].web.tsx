import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { saveConnection } from "@/lib/api";
import type { Platform } from "@/lib/types";
import { theme } from "@/lib/theme";

const TITLES: Record<Platform, string> = {
  grailed: "Connect Grailed",
  depop: "Connect Depop",
  ebay: "Connect eBay",
};

const MOCK_MODE = ["1", "true", "yes", "on"].includes((process.env.EXPO_PUBLIC_MOCK_MODE ?? "").toLowerCase());

export default function ConnectPlatformWebScreen() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const typedPlatform = platform as Platform;
  const title = TITLES[typedPlatform];

  if (!title) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Unknown platform: {platform}</Text>
      </View>
    );
  }

  async function connectMock() {
    setSaving(true);
    try {
      const tokens =
        typedPlatform === "grailed"
          ? { csrf_token: "mock-csrf-token", cookies: "csrf_token=mock-csrf-token; _session=mock" }
          : { access_token: "mock-access-token" };

      await saveConnection({
        platform: typedPlatform,
        tokens,
        platformUsername: `mock-${typedPlatform}-user`,
      });

      Alert.alert("Connected", `${title} saved (mock).`, [{ text: "OK", onPress: () => router.back() }]);
    } catch (err) {
      Alert.alert("Error", "Failed to save connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        <Text style={styles.kicker}>Marketplace</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.copy}>
          {MOCK_MODE
            ? "Web mock mode is enabled. Save a mock token to test end-to-end flows quickly."
            : "Browser auth is not supported on this screen. Use iOS/Android, or set EXPO_PUBLIC_MOCK_MODE=1."}
        </Text>

        {MOCK_MODE && (
          <Pressable style={styles.button} onPress={connectMock} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.buttonText}>Save Mock Connection</Text>
            )}
          </Pressable>
        )}

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: 16,
  },
  content: {
    marginTop: 20,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 12,
    ...theme.shadow.card,
  },
  kicker: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 34,
  },
  copy: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
    lineHeight: 21,
  },
  button: {
    marginTop: 12,
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  error: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontFamily: theme.fonts.sans,
  },
});
