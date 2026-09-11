import { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Modal, ScrollView } from "react-native";
import type { Listing, Platform } from "@/lib/types";
import type { PublishMode } from "@/lib/publish-mode";
import { theme, PLATFORM_CODES } from "@/lib/theme";
import { useFadeSlideIn } from "@/lib/motion";

type Props = {
  /** Snapshot of the published listings taken when polling finished — not live state. */
  listings: Listing[];
  platforms: Platform[];
  mode: PublishMode;
  onDone: () => void;
  onCaptureNext: () => void;
};

type PlacementKind = "ok" | "failed" | "printing" | "other";

function placementStatus(listing: Listing, platform: Platform, mode: PublishMode): { label: string; kind: PlacementKind } {
  const pl = (listing.platform_listings ?? []).find((x) => x.platform === platform);
  if (!pl) return { label: "—", kind: "other" };
  if (pl.status === "live") return { label: "LIVE ✓", kind: "ok" };
  // In draft mode a successful publish lands on "pending" with a remote draft.
  if (pl.status === "pending" && mode === "draft") return { label: "FILED ✓", kind: "ok" };
  if (pl.status === "publishing") return { label: "PRINTING…", kind: "printing" };
  if (pl.status === "failed") return { label: "FAILED ✗", kind: "failed" };
  return { label: pl.status.toUpperCase(), kind: "other" };
}

/**
 * The torn-edge receipt: publishing is printing, and this is what comes
 * out of the machine when a bulk publish finishes. Totals count placements
 * (listing × platform) so partial failures are never reported as full success.
 */
export default function PublishReceipt({ listings, platforms, mode, onDone, onCaptureNext }: Props) {
  const feed = useFadeSlideIn({ y: -24, duration: 350 });
  // A receipt is printed once: the timestamp must not drift on re-render.
  const stampRef = useRef(
    new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  const placements = listings.flatMap((listing) =>
    platforms.map((platform) => placementStatus(listing, platform, mode))
  );
  const okCount = placements.filter((p) => p.kind === "ok").length;
  const stillPrinting = placements.some((p) => p.kind === "printing");
  const totalLabel = mode === "draft" ? "FILED" : "LIVE";

  return (
    <Modal transparent visible animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <View style={styles.overlay} accessibilityViewIsModal>
        <Animated.View style={[styles.receipt, feed]}>
          <Text style={styles.head}>VIBELYSTER</Text>
          <Text style={styles.sub}>CROSS-POST RECEIPT</Text>
          <View style={styles.rule} />
          {/* Long batches scroll inside the receipt so Done/Capture Next stay reachable. */}
          <ScrollView style={styles.itemScroll}>
            {listings.map((listing) => (
              <View key={listing.id} style={styles.item}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {(listing.title || "UNTITLED").toUpperCase()}
                </Text>
                {platforms.map((platform) => {
                  const placement = placementStatus(listing, platform, mode);
                  return (
                    <View key={platform} style={styles.line}>
                      <Text style={styles.lineText}>{PLATFORM_CODES[platform] ?? platform.toUpperCase()}</Text>
                      <Text style={[styles.lineText, placement.kind === "failed" && styles.lineFailed]}>
                        {placement.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <View style={styles.rule} />
          <View style={styles.line}>
            <Text style={styles.totalText}>
              {okCount}/{placements.length} {totalLabel}
            </Text>
            <Text style={styles.totalText}>{stampRef.current}</Text>
          </View>
          <Text style={styles.keep}>{stillPrinting ? "– STILL PRINTING · PULL TO REFRESH –" : "– KEEP THIS RECEIPT –"}</Text>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
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
  // iOS only renders dashed borders when uniform on all sides — a thin
  // clipped box keeps the dashed top edge visible cross-platform.
  rule: {
    height: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    marginVertical: theme.spacing.md,
  },
  itemScroll: {
    maxHeight: 320,
    flexGrow: 0,
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
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.ink,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: theme.spacing.md,
  },
  secondaryText: {
    color: theme.colors.ink,
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
    justifyContent: "center",
    minHeight: 48,
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
