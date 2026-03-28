import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import type { PlatformListing } from "@/lib/types";

type Props = {
  platformListing: PlatformListing;
  onPublish: () => void;
  onDelist: () => void;
  onConnect: () => void;
  publishing?: boolean;
  delisting?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Not published",
  publishing: "Publishing…",
  live: "Live",
  failed: "Failed",
  sold: "Sold",
  delisted: "Delisted",
};

const STATUS_COLORS: Record<string, string> = {
  live: "#22cc66",
  sold: "#0099ff",
  failed: "#ff4444",
  delisted: "#555",
  publishing: "#ffaa00",
  pending: "#555",
};

export default function PlatformRow({ platformListing, onPublish, onDelist, onConnect, publishing, delisting }: Props) {
  const { platform, status } = platformListing;
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const statusLabel = STATUS_LABELS[status] ?? status;
  const statusColor = STATUS_COLORS[status] ?? "#555";

  function renderAction() {
    if (publishing || delisting) {
      return <ActivityIndicator size="small" color="#fff" />;
    }

    if (status === "live" || status === "sold") {
      return (
        <Pressable onPress={onDelist} style={styles.delistBtn}>
          <Text style={styles.delistText}>Delist</Text>
        </Pressable>
      );
    }

    if (status === "delisted" || status === "pending" || status === "failed") {
      return (
        <Pressable onPress={onPublish} style={styles.publishBtn}>
          <Text style={styles.publishText}>{status === "failed" ? "Retry" : "Publish"}</Text>
        </Pressable>
      );
    }

    // Not connected (no platform_listing row or status unknown)
    return (
      <Pressable onPress={onConnect} style={styles.connectBtn}>
        <Text style={styles.connectText}>Connect →</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.platformName}>{label}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {status === "failed" && platformListing.last_error && (
          <Text style={styles.errorText} numberOfLines={1}>{platformListing.last_error}</Text>
        )}
      </View>
      <View style={styles.action}>
        {renderAction()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#111", borderRadius: 10, padding: 14 },
  left: { flex: 1, gap: 4 },
  platformName: { color: "#fff", fontSize: 15, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 13 },
  errorText: { color: "#ff4444", fontSize: 11, marginTop: 2 },
  action: { marginLeft: 12 },
  publishBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#fff", borderRadius: 8 },
  publishText: { color: "#000", fontWeight: "700", fontSize: 13 },
  delistBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: "#ff4444" },
  delistText: { color: "#ff4444", fontWeight: "700", fontSize: 13 },
  connectBtn: {},
  connectText: { color: "#0099ff", fontWeight: "600", fontSize: 13 },
});
