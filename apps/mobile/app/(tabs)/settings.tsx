import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { getConnections, disconnectPlatform } from "@/lib/api";
import type { MarketplaceConnection, Platform } from "@/lib/types";

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "grailed", label: "Grailed" },
  { key: "depop", label: "Depop" },
];

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null);

  const loadConnections = useCallback(async () => {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadConnections(); }, [loadConnections]));

  function getConnection(platform: Platform) {
    return connections.find((c) => c.platform === platform);
  }

  function handleConnect(platform: Platform) {
    router.push(`/connect/${platform}`);
  }

  function handleDisconnect(platform: Platform) {
    Alert.alert(
      `Disconnect ${platform}`,
      `Remove your ${platform} connection? You can reconnect anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setDisconnecting(platform);
            try {
              await disconnectPlatform(platform);
              await loadConnections();
            } catch (err) {
              Alert.alert("Error", "Failed to disconnect. Try again.");
            } finally {
              setDisconnecting(null);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Account section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.email}>{user?.primaryEmailAddress?.emailAddress ?? "—"}</Text>
          <Pressable onPress={() => signOut()} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>

      {/* Marketplaces section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Marketplaces</Text>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.card}>
            {PLATFORMS.map(({ key, label }) => {
              const conn = getConnection(key);
              return (
                <View key={key} style={styles.platformRow}>
                  <View>
                    <Text style={styles.platformName}>{label}</Text>
                    {conn && <Text style={styles.platformUsername}>{conn.platform_username ?? "Connected"}</Text>}
                  </View>
                  {conn ? (
                    <Pressable
                      onPress={() => handleDisconnect(key)}
                      style={styles.disconnectBtn}
                      disabled={disconnecting === key}
                    >
                      {disconnecting === key ? (
                        <ActivityIndicator size="small" color="#ff4444" />
                      ) : (
                        <Text style={styles.disconnectText}>Disconnect</Text>
                      )}
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => handleConnect(key)} style={styles.connectBtn}>
                      <Text style={styles.connectText}>Connect →</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  content: { padding: 16, gap: 24 },
  section: { gap: 8 },
  sectionTitle: { color: "#555", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 4 },
  card: { backgroundColor: "#111", borderRadius: 12, overflow: "hidden" },
  email: { color: "#fff", fontSize: 15, padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" },
  signOutBtn: { padding: 16 },
  signOutText: { color: "#ff4444", fontSize: 15, fontWeight: "600" },
  platformRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: "#222" },
  platformName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  platformUsername: { color: "#555", fontSize: 13, marginTop: 2 },
  connectBtn: {},
  connectText: { color: "#0099ff", fontSize: 14, fontWeight: "600" },
  disconnectBtn: {},
  disconnectText: { color: "#ff4444", fontSize: 14, fontWeight: "600" },
});
