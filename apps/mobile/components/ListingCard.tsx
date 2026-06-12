import { View, Text, StyleSheet, Pressable, Image, Animated, ActivityIndicator } from "react-native";
import type { Listing, Platform } from "@/lib/types";
import { getDisplayStatus } from "@/lib/types";
import { theme, PLATFORM_CODES } from "@/lib/theme";
import { useFadeSlideIn, usePressScale } from "@/lib/motion";

const PLATFORMS: Platform[] = ["grailed", "ebay", "depop"] as Platform[];

type Props = {
  listing: Listing;
  selectable?: boolean;
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  entranceIndex?: number;
};

/**
 * Platform state as print treatment, not color dots:
 * outline = draft/pending · solid ink = live · struck = failed · red = sold.
 */
function PlatformCode({ platform, status }: { platform: Platform; status?: string }) {
  const code = PLATFORM_CODES[platform] ?? platform.slice(0, 3).toUpperCase();

  if (status === "live") {
    return (
      <View style={[styles.code, styles.codeLive]}>
        <Text style={[styles.codeText, styles.codeTextLive]}>{code}</Text>
      </View>
    );
  }
  if (status === "sold") {
    return (
      <View style={[styles.code, styles.codeSold]}>
        <Text style={[styles.codeText, styles.codeTextSold]}>{code}</Text>
      </View>
    );
  }
  if (status === "failed") {
    return (
      <View style={[styles.code, styles.codeFailed]}>
        <Text style={[styles.codeText, styles.codeTextFailed]}>{code}</Text>
      </View>
    );
  }
  if (status === "publishing") {
    return (
      <View style={[styles.code, styles.codePublishing]}>
        <Text style={[styles.codeText, styles.codeTextPublishing]}>{code}</Text>
      </View>
    );
  }
  // draft / pending / delisted / not on platform
  const dimmed = !status || status === "delisted";
  return (
    <View style={[styles.code, styles.codeDraft, dimmed && styles.codeDimmed]}>
      <Text style={[styles.codeText, dimmed && styles.codeTextDimmed]}>{code}</Text>
    </View>
  );
}

function MiniStamp({ kind }: { kind: "draft" | "sold" }) {
  const sold = kind === "sold";
  return (
    <View style={[styles.stamp, sold ? styles.stampSold : styles.stampDraft]}>
      <Text style={[styles.stampText, sold ? styles.stampTextSold : styles.stampTextDraft]}>
        {sold ? "SOLD" : "DRAFT"}
      </Text>
    </View>
  );
}

export default function ListingCard({
  listing,
  selectable,
  selected,
  onPress,
  onLongPress,
  entranceIndex = 0,
}: Props) {
  const displayStatus = getDisplayStatus(listing);
  const firstPhoto = listing.photos?.[0];
  const title = listing.title?.trim() || "Untitled draft";
  const priceText =
    listing.price == null || Number.isNaN(Number(listing.price)) ? "—" : `$${Number(listing.price).toFixed(0)}`;
  const platformListings = listing.platform_listings ?? [];
  const generating = listing.generation_status === "generating";
  const press = usePressScale({ pressedScale: 0.99 });
  // thermal feed: rows print in from the top, stepped
  const entrance = useFadeSlideIn({
    delay: Math.min(entranceIndex * 40, 240),
    y: -6,
    duration: 180,
  });

  const stamp = displayStatus === "sold" ? "sold" : displayStatus === "draft" ? "draft" : null;

  return (
    <Animated.View style={[entrance, press.animatedStyle]}>
      <Pressable
        style={[styles.row, selected && styles.rowSelected]}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <View style={styles.thumbWrap}>
          {firstPhoto ? (
            <Image source={{ uri: firstPhoto }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={styles.thumbPlaceholderText}>NO{"\n"}PHOTO</Text>
            </View>
          )}
          {stamp ? <MiniStamp kind={stamp} /> : null}
        </View>

        <View style={styles.det}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {generating ? (
            <View style={styles.typingRow}>
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
              <Text style={styles.typingText}>TYPING DRAFT…</Text>
            </View>
          ) : (
            <View style={styles.codes}>
              {PLATFORMS.map((platform) => {
                const pl = platformListings.find((x) => x.platform === platform);
                return <PlatformCode key={platform} platform={platform} status={pl?.status} />;
              })}
            </View>
          )}
        </View>

        <View style={styles.right}>
          <Text style={styles.price}>{priceText}</Text>
          <Text style={styles.statusLine}>{displayStatus.replace(/_/g, " ").toUpperCase()}</Text>
        </View>

        {selectable && (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected && <Text style={styles.checkmark}>✕</Text>}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
    backgroundColor: theme.colors.bg,
  },
  rowSelected: {
    backgroundColor: theme.colors.accentSoft,
  },
  thumbWrap: {
    width: 52,
    height: 52,
  },
  thumb: {
    width: 52,
    height: 52,
    borderWidth: 1,
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors.surfaceStrong,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    fontFamily: theme.fonts.mono,
    fontSize: 7,
    lineHeight: 9,
    textAlign: "center",
    color: theme.colors.textMuted,
  },
  stamp: {
    position: "absolute",
    top: 4,
    left: -6,
    borderWidth: 1.5,
    paddingHorizontal: 3,
    paddingVertical: 0,
    transform: [{ rotate: "-12deg" }],
    backgroundColor: "rgba(242, 238, 227, 0.72)",
  },
  stampDraft: { borderColor: theme.colors.textMuted },
  stampSold: { borderColor: theme.colors.stamp },
  stampText: {
    fontFamily: theme.fonts.display,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  stampTextDraft: { color: theme.colors.textMuted },
  stampTextSold: { color: theme.colors.stamp },
  det: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typingText: {
    fontFamily: theme.fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  codes: {
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  code: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  codeText: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.3,
    color: theme.colors.ink,
  },
  codeDraft: {
    borderWidth: 1,
    borderColor: theme.colors.ink,
  },
  codeDimmed: {
    borderColor: theme.colors.borderSoft,
  },
  codeTextDimmed: {
    color: theme.colors.textMuted,
  },
  codeLive: {
    backgroundColor: theme.colors.ink,
    borderWidth: 1,
    borderColor: theme.colors.ink,
  },
  codeTextLive: {
    color: theme.colors.bg,
  },
  codeFailed: {
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
  },
  codeTextFailed: {
    color: theme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  codeSold: {
    borderWidth: 1.5,
    borderColor: theme.colors.stamp,
    transform: [{ rotate: "-2deg" }],
  },
  codeTextSold: {
    color: theme.colors.stamp,
  },
  codePublishing: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  codeTextPublishing: {
    color: theme.colors.accent,
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
  },
  price: {
    color: theme.colors.text,
    fontFamily: theme.fonts.monoBold,
    fontSize: 14,
  },
  statusLine: {
    fontFamily: theme.fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  checkbox: {
    width: 22,
    height: 22,
    marginLeft: theme.spacing.xs,
    borderWidth: 1.5,
    borderColor: theme.colors.ink,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  checkboxSelected: {
    backgroundColor: theme.colors.ink,
  },
  checkmark: {
    color: theme.colors.accent,
    fontSize: 12,
    fontFamily: theme.fonts.monoBold,
    lineHeight: 14,
  },
});
