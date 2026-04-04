import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { getConnections, disconnectPlatform } from "@/lib/api";
import type { MarketplaceConnection, Platform } from "@/lib/types";
import { getPublishMode, setPublishMode, type PublishMode } from "@/lib/publish-mode";
import { theme } from "@/lib/theme";
import { useToast } from "@/lib/toast";

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "grailed", label: "Grailed" },
  { key: "depop", label: "Depop" },
  { key: "ebay", label: "eBay" },
];

const MOCK_MODE = ["1", "true", "yes", "on"].includes((process.env.EXPO_PUBLIC_MOCK_MODE ?? "").toLowerCase());

function confirmAction(title: string, message: string, confirmText = "Confirm") {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

function useSessionState() {
  if (MOCK_MODE) {
    return {
      email: "mock@vibelyster.local",
      canSignOut: false,
      signOut: async () => undefined,
    };
  }

  const clerk = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { signOut } = clerk.useAuth();
  const { user } = clerk.useUser();

  return {
    email: user?.primaryEmailAddress?.emailAddress ?? "—",
    canSignOut: true,
    signOut,
  };
}

export default function SettingsScreen() {
  const { signOut, email, canSignOut } = useSessionState();
  const router = useRouter();
  const { showToast } = useToast();
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null);
  const [publishMode, setPublishModeState] = useState<PublishMode>("live");

  const loadConnections = useCallback(async () => {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (err) {
      console.error(err);
      showToast("Failed to load connections.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadPublishMode = useCallback(async () => {
    try {
      setPublishModeState(await getPublishMode());
    } catch (err) {
      console.error(err);
      showToast("Failed to load publish preference.");
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      loadConnections();
      loadPublishMode();
    }, [loadConnections, loadPublishMode])
  );

  function getConnection(platform: Platform) {
    return connections.find((connection) => connection.platform === platform);
  }

  function handleConnect(platform: Platform) {
    router.push(`/connect/${platform}`);
  }

  async function handleDisconnect(platform: Platform) {
    const confirmed = await confirmAction(
      `Disconnect ${platform}`,
      `Remove your ${platform} connection? You can reconnect anytime.`,
      "Disconnect"
    );
    if (!confirmed) return;

    setDisconnecting(platform);
    try {
      await disconnectPlatform(platform);
      await loadConnections();
    } catch (err) {
      showToast("Failed to disconnect. Try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  async function handlePublishModeChange(nextMode: PublishMode) {
    try {
      await setPublishMode(nextMode);
      setPublishModeState(nextMode);
    } catch (err) {
      console.error(err);
      showToast("Failed to update publish preference.");
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Profile</Text>
          <Text style={styles.heroTitle}>Account & Connections</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <Text style={styles.email}>{email}</Text>
            {canSignOut ? (
              <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            ) : (
              <Text style={styles.mockHint}>Mock mode active</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Publishing</Text>
          <View style={styles.card}>
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceTextWrap}>
                <Text style={styles.preferenceTitle}>Default publish mode</Text>
                <Text style={styles.preferenceBody}>
                  Live keeps the current one-tap publish flow. Draft only saves marketplace drafts until you switch back.
                </Text>
              </View>
              <View style={styles.modeToggle}>
                {(["live", "draft"] as PublishMode[]).map((mode) => {
                  const active = publishMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => handlePublishModeChange(mode)}
                      style={[styles.modeToggleBtn, active && styles.modeToggleBtnActive]}
                    >
                      <Text style={[styles.modeToggleText, active && styles.modeToggleTextActive]}>
                        {mode === "live" ? "Live" : "Draft only"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Marketplaces</Text>
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : (
            <View style={styles.card}>
              {PLATFORMS.map(({ key, label }, idx) => {
                const connection = getConnection(key);
                const isLast = idx === PLATFORMS.length - 1;

                return (
                  <View key={key} style={[styles.platformRow, !isLast && styles.platformRowDivider]}>
                    <View style={styles.platformInfo}>
                      <Text style={styles.platformName}>{label}</Text>
                      <Text style={styles.platformUsername}>
                        {connection ? (connection.platform_username ?? "Connected") : "Not connected"}
                      </Text>
                    </View>

                    {connection ? (
                      <Pressable
                        onPress={() => handleDisconnect(key)}
                        style={styles.disconnectBtn}
                        disabled={disconnecting === key}
                      >
                        {disconnecting === key ? (
                          <ActivityIndicator size="small" color={theme.colors.danger} />
                        ) : (
                          <Text style={styles.disconnectText}>Disconnect</Text>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => handleConnect(key)} style={styles.connectBtn}>
                        <Text style={styles.connectText}>Connect</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 18,
  },
  hero: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 31,
    lineHeight: 36,
    marginTop: 3,
    letterSpacing: -0.5,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginLeft: 2,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    ...theme.shadow.raised,
  },
  preferenceRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  preferenceTextWrap: {
    gap: 5,
  },
  preferenceTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  preferenceBody: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
  },
  modeToggleBtn: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeToggleBtnActive: {
    backgroundColor: theme.colors.accent,
  },
  modeToggleText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  modeToggleTextActive: {
    color: theme.colors.white,
  },
  email: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  signOutBtn: {
    margin: 16,
    marginTop: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    alignItems: "center",
    paddingVertical: 11,
  },
  signOutText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  mockHint: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    margin: 16,
    marginTop: 2,
  },
  loaderWrap: {
    paddingVertical: 24,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  platformRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  platformInfo: {
    gap: 2,
  },
  platformName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  platformUsername: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  connectBtn: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  connectText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  disconnectBtn: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: "center",
  },
  disconnectText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
});
