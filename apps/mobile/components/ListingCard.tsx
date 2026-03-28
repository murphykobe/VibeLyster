import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import type { Listing, Platform } from "@/lib/types";
import { getDisplayStatus } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  live: "#22cc66",
  partially_live: "#ffaa00",
  draft: "#555",
  sold: "#0099ff",
};

const PLATFORM_DOT_COLORS: Record<string, string> = {
  live: "#22cc66",
  publishing: "#ffaa00",
  failed: "#ff4444",
  sold: "#0099ff",
  delisted: "#555",
  pending: "#333",
};

type Props = {
  listing: Listing;
  selectable?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

export default function ListingCard({ listing, selectable, selected, onPress, onLongPress }: Props) {
  const displayStatus = getDisplayStatus(listing);
  const statusColor = STATUS_COLORS[displayStatus] ?? "#555";
  const firstPhoto = listing.photos?.[0];
  const platformListings = listing.platform_listings ?? [];

  return (
    <Pressable style={[styles.card, selected && styles.cardSelected]} onPress={onPress} onLongPress={onLongPress}>
      {/* Thumbnail */}
      {firstPhoto ? (
        <Image source={{ uri: firstPhoto }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{listing.title}</Text>
        <Text style={styles.price}>${Number(listing.price).toFixed(0)}</Text>
        <View style={styles.meta}>
          <Text style={[styles.status, { color: statusColor }]}>{displayStatus.replace("_", " ")}</Text>
          <View style={styles.dots}>
            {(["grailed", "depop"] as Platform[]).map((p) => {
              const pl = platformListings.find((x) => x.platform === p);
              const dotColor = pl ? (PLATFORM_DOT_COLORS[pl.status] ?? "#333") : "#1a1a1a";
              return <View key={p} style={[styles.dot, { backgroundColor: dotColor }]} />;
            })}
          </View>
        </View>
      </View>

      {/* Selection checkbox */}
      {selectable && (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkmark}>✓</Text>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", backgroundColor: "#111", borderRadius: 12, marginBottom: 8, overflow: "hidden" },
  cardSelected: { borderWidth: 1, borderColor: "#fff" },
  thumb: { width: 90, height: 90 },
  thumbPlaceholder: { backgroundColor: "#222" },
  info: { flex: 1, padding: 12, justifyContent: "space-between" },
  title: { color: "#fff", fontSize: 14, fontWeight: "600", lineHeight: 18 },
  price: { color: "#fff", fontSize: 16, fontWeight: "700" },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  checkbox: { width: 32, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: "#222" },
  checkboxSelected: { backgroundColor: "#fff" },
  checkmark: { color: "#000", fontSize: 14, fontWeight: "700" },
});
