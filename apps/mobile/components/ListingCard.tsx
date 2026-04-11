import { View, Text, StyleSheet, Pressable, Image, Animated, ActivityIndicator } from "react-native";
import type { Listing, Platform } from "@/lib/types";
import { getDisplayStatus } from "@/lib/types";
import { theme } from "@/lib/theme";
import { useFadeSlideIn, usePressScale } from "@/lib/motion";

const STATUS_COLORS: Record<string, string> = {
  live: theme.colors.success,
  partially_live: theme.colors.warning,
  draft: theme.colors.textMuted,
  sold: theme.colors.info,
};

const PLATFORM_DOT_COLORS: Record<string, string> = {
  live: theme.colors.success,
  publishing: theme.colors.warning,
  failed: theme.colors.danger,
  sold: theme.colors.info,
  delisted: theme.colors.textMuted,
  pending: theme.colors.border,
};

type Props = {
  listing: Listing;
  selectable?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  entranceIndex?: number;
};

export default function ListingCard({
  listing,
  selectable,
  selected,
  onPress,
  onLongPress,
  entranceIndex = 0,
}: Props) {
  const displayStatus = getDisplayStatus(listing);
  const statusColor = STATUS_COLORS[displayStatus] ?? theme.colors.textMuted;
  const firstPhoto = listing.photos?.[0];
  const title = listing.title?.trim() || "Untitled draft";
  const priceText = listing.price == null || Number.isNaN(Number(listing.price)) ? "—" : `$${Number(listing.price).toFixed(0)}`;
  const platformListings = listing.platform_listings ?? [];
  const press = usePressScale({ pressedScale: 0.985 });
  const entrance = useFadeSlideIn({
    delay: Math.min(entranceIndex * 45, 260),
    y: 10,
    duration: 240,
  });

  return (
    <Animated.View style={[entrance, press.animatedStyle]}>
      <Pressable
        style={[styles.card, selected && styles.cardSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        {firstPhoto ? (
          <View style={styles.thumbWrap}>
            <Image source={{ uri: firstPhoto }} style={styles.thumb} />
            {listing.generation_status === "generating" ? (
              <View style={styles.generatingBadge}>
                <ActivityIndicator size="small" color={theme.colors.white} />
                <Text style={styles.generatingBadgeText}>Generating</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.thumbWrap, styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>No Photo</Text>
            {listing.generation_status === "generating" ? (
              <View style={styles.generatingBadge}>
                <ActivityIndicator size="small" color={theme.colors.white} />
                <Text style={styles.generatingBadgeText}>Generating</Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <View style={styles.pricePill}>
              <Text style={styles.priceText}>{priceText}</Text>
            </View>
          </View>

          <View style={styles.bottomRow}>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}1A` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {displayStatus.replace(/_/g, " ")}
              </Text>
            </View>

            <View style={styles.platformDots}>
              {(["grailed", "depop"] as Platform[]).map((platform) => {
                const pl = platformListings.find((x) => x.platform === platform);
                const dotColor = pl ? (PLATFORM_DOT_COLORS[pl.status] ?? theme.colors.border) : theme.colors.border;
                return (
                  <View key={platform} style={styles.dotWrap}>
                    <View style={[styles.dot, { backgroundColor: dotColor }]} />
                    <Text style={styles.dotLabel}>{platform.slice(0, 1).toUpperCase()}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {selectable && (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginBottom: 12,
    overflow: "hidden",
    ...theme.shadow.raised,
  },
  cardSelected: {
    shadowColor: "#6C63FF",
    shadowOpacity: 0.5,
  },
  thumb: {
    width: 104,
    height: 104,
    backgroundColor: theme.colors.surfaceStrong,
  },
  thumbWrap: {
    width: 104,
    height: 104,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  generatingBadge: {
    position: "absolute",
    left: 8,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: "rgba(16, 20, 35, 0.78)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  generatingBadgeText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 11,
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
    lineHeight: 20,
  },
  pricePill: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  priceText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusPill: {
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 12,
    textTransform: "capitalize",
    fontFamily: theme.fonts.sansBold,
  },
  platformDots: {
    flexDirection: "row",
    gap: 8,
  },
  dotWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 99,
  },
  dotLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.sans,
  },
  checkbox: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.accentSoft,
  },
  checkmark: {
    color: theme.colors.accent,
    fontSize: 15,
    fontFamily: theme.fonts.sansBold,
  },
});
