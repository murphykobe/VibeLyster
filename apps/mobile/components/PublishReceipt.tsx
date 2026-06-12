import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import type { Listing, Platform } from "@/lib/types";
import { theme, PLATFORM_CODES } from "@/lib/theme";
import { useFadeSlideIn } from "@/lib/motion";

type Props = {
  listings: Listing[];
  platforms: Platform[];
  onDone: () => void;
  onCaptureNext: () => void;
};

function platformStatus(listing: Listing, platform: Platform): string {
  const pl = (listing.platform_listings ?? []).find((x) => x.platform === platform);
  if (!pl) return "—";
  if (pl.status === "live") return "LIVE ✓";
  if (pl.status === "publishing") return "PRINTING…";
  if (pl.status === "failed") return "FAILED ✗";
  return pl.status.toUpperCase();
}

/**
 * The torn-edge receipt: publishing is printing, and this is what comes
 * out of the machine when a bulk publish finishes.
 */
export default function PublishReceipt({ listings, platforms, onDone, onCaptureNext }: Props) {
  const feed = useFadeSlideIn({ y: -24, duration: 350 });
  const liveCount = listings.filter((l) =>
    (l.platform_listings ?? []).some((pl) => platforms.includes(pl.platform as Platform) && pl.status === "live")
  ).length;
  const now = new Date();
  const stamp = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}`;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.receipt, feed]}>
        <Text style={styles.head}>VIBELYSTER</Text>
        <Text style={styles.sub}>CROSS-POST RECEIPT</Text>
        <View style={styles.rule} />
        {listings.map((listing) => (
          <View key={listing.id} style={styles.item}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {(listing.title || "UNTITLED").toUpperCase()}
            </Text>
            {platforms.map((platform) => (
              <View key={platform} style={styles.line}>
                <Text style={styles.lineText}>{PLATFORM_CODES[platform] ?? platform.toUpperCase()}</Text>
                <Text
                  style={[
                    styles.lineText,
                    platformStatus(listing, platform).startsWith("FAILED") && styles.lineFailed,
                  ]}
                >
                  {platformStatus(listing, platform)}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.rule} />
        <View style={styles.line}>
          <Text style={styles.totalText}>
            {liveCount}/{listings.length} {listings.length === 1 ? "ITEM" : "ITEMS"} LIVE
          </Text>
          <Text style={styles.totalText}>{stamp}</Text>
        </View>
        <Text style={styles.keep}>– KEEP THIS RECEIPT –</Text>
        <View style={styles.tornEdge}>
          {Array.from({ length: 14 }).map((_, i) => (
            <View key={i} style={styles.tooth} />
          ))}
        </View>
      </Animated.View>

      <View style={styles.actions}>
        <Pressable style={styles.secondaryBtn} onPress={onDone}>
          <Text style={styles.secondaryText}>Done</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={onCaptureNext}>
          <Text style={styles.primaryText}>◉ Capture Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(28, 26, 23, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    zIndex: 100,
  },
  receipt: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomWidth: 0,
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  head: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 13,
    letterSpacing: 2,
    textAlign: "center",
    color: theme.colors.text,
  },
  sub: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: "center",
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rule: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderBottomColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  item: {
    marginBottom: theme.spacing.md,
    gap: 3,
  },
  itemTitle: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 11,
    color: theme.colors.text,
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  lineText: {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    color: theme.colors.text,
  },
  lineFailed: {
    color: theme.colors.stamp,
  },
  totalText: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 12,
    color: theme.colors.text,
  },
  keep: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textAlign: "center",
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  tornEdge: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: -theme.spacing.lg,
    overflow: "hidden",
    height: 8,
  },
  tooth: {
    width: 16,
    height: 16,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    transform: [{ rotate: "45deg" }],
    marginTop: -10,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
    width: "100%",
    maxWidth: 320,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: theme.colors.bg,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  secondaryText: {
    color: theme.colors.bg,
    fontFamily: theme.fonts.display,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  primaryBtn: {
    flex: 2,
    backgroundColor: theme.colors.accent,
    borderWidth: 1.5,
    borderColor: theme.colors.ink,
    alignItems: "center",
    paddingVertical: theme.spacing.md,
  },
  primaryText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.display,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
