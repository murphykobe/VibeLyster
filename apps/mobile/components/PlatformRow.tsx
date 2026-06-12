import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { getRemoteListingState, type PlatformListing } from "@/lib/types";
import { theme, PLATFORM_CODES } from "@/lib/theme";

type Props = {
  platformListing: PlatformListing;
  connected: boolean;
  onPublish: () => void;
  onDelist: () => void;
  onConnect: () => void;
  publishing?: boolean;
  delisting?: boolean;
  publishLabel?: string;
};

// Label text content is part of the e2e contract ("Publish", "Delist", "Live");
// the print voice comes from type treatment, not copy changes.
const STATUS_LABELS: Record<string, string> = {
  pending: "Ready to publish",
  publishing: "Printing",
  live: "Live",
  failed: "Needs retry",
  sold: "Sold",
  delisted: "Delisted",
};

export default function PlatformRow({
  platformListing,
  connected,
  onPublish,
  onDelist,
  onConnect,
  publishing,
  delisting,
  publishLabel,
}: Props) {
  const { platform, status } = platformListing;
  const remoteState = getRemoteListingState(platformListing);
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const code = PLATFORM_CODES[platform] ?? platform.slice(0, 3).toUpperCase();
  const statusLabel =
    remoteState === "draft" && status === "pending" ? "Draft saved" : (STATUS_LABELS[status] ?? status);

  const codeStyle =
    status === "live"
      ? [styles.code, styles.codeLive]
      : status === "sold"
        ? [styles.code, styles.codeSold]
        : status === "failed"
          ? [styles.code, styles.codeFailed]
          : [styles.code];
  const codeTextStyle =
    status === "live"
      ? [styles.codeText, styles.codeTextLive]
      : status === "sold"
        ? [styles.codeText, styles.codeTextSold]
        : status === "failed"
          ? [styles.codeText, styles.codeTextFailed]
          : [styles.codeText];
  const statusStyle =
    status === "live"
      ? [styles.statusLabel, styles.statusLive]
      : status === "sold"
        ? [styles.statusLabel, styles.statusSold]
        : status === "failed"
          ? [styles.statusLabel, styles.statusFailed]
          : [styles.statusLabel];

  function renderAction() {
    if (!connected) {
      return (
        <Pressable onPress={onConnect} style={[styles.actionBtn, styles.actionLink]}>
          <Text style={[styles.actionText, styles.actionLinkText]}>Connect</Text>
        </Pressable>
      );
    }

    if (publishing || delisting) {
      return (
        <View style={styles.printingWrap}>
          <ActivityIndicator size="small" color={theme.colors.ink} />
          <Text style={styles.printingText}>{publishing ? "PRINTING…" : "PULLING…"}</Text>
        </View>
      );
    }

    if (status === "live" || status === "sold") {
      return (
        <Pressable onPress={onDelist} style={[styles.actionBtn, styles.actionGhost]}>
          <Text style={[styles.actionText, styles.actionGhostText]}>Delist</Text>
        </Pressable>
      );
    }

    if (status === "delisted" || status === "pending" || status === "failed") {
      return (
        <Pressable onPress={onPublish} style={[styles.actionBtn, styles.actionPrimary]}>
          <Text style={[styles.actionText, styles.actionPrimaryText]}>
            {publishLabel ?? (status === "failed" ? "Retry" : "Publish")}
          </Text>
        </Pressable>
      );
    }

    return null;
  }

  return (
    <View style={styles.row}>
      <View style={codeStyle}>
        <Text style={codeTextStyle}>{code}</Text>
      </View>
      <View style={styles.left}>
        <Text style={styles.platformName}>{label}</Text>
        <Text style={statusStyle}>{statusLabel}</Text>
        {status === "failed" && platformListing.last_error && (
          <Text style={styles.errorText} numberOfLines={1}>
            {platformListing.last_error}
          </Text>
        )}
      </View>
      {renderAction() ?? <View style={styles.actionSpacer} />}
    </View>
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
  },
  code: {
    minWidth: 42,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.ink,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  codeText: {
    fontFamily: theme.fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: theme.colors.ink,
  },
  codeLive: {
    backgroundColor: theme.colors.ink,
  },
  codeTextLive: {
    color: theme.colors.bg,
  },
  codeSold: {
    borderWidth: 1.5,
    borderColor: theme.colors.stamp,
    transform: [{ rotate: "-2deg" }],
  },
  codeTextSold: {
    color: theme.colors.stamp,
  },
  codeFailed: {
    borderColor: theme.colors.borderSoft,
  },
  codeTextFailed: {
    color: theme.colors.textMuted,
    textDecorationLine: "line-through",
  },
  left: {
    flex: 1,
    gap: 2,
    paddingRight: theme.spacing.sm,
  },
  platformName: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.fonts.sansBold,
  },
  statusLabel: {
    fontSize: 9,
    fontFamily: theme.fonts.mono,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  statusLive: {
    color: theme.colors.success,
  },
  statusSold: {
    color: theme.colors.stamp,
  },
  statusFailed: {
    color: theme.colors.danger,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 11,
    fontFamily: theme.fonts.mono,
  },
  printingWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 86,
    justifyContent: "center",
  },
  printingText: {
    fontFamily: theme.fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  actionBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minWidth: 86,
    alignItems: "center",
  },
  actionText: {
    fontSize: 11,
    fontFamily: theme.fonts.sansBold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionPrimary: {
    backgroundColor: theme.colors.accent,
  },
  actionPrimaryText: {
    color: theme.colors.white,
  },
  actionGhost: {
    borderWidth: 1,
    borderColor: theme.colors.stamp,
  },
  actionGhostText: {
    color: theme.colors.stamp,
  },
  actionLink: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.ballpoint,
  },
  actionLinkText: {
    color: theme.colors.ballpoint,
  },
  actionSpacer: {
    minWidth: 86,
  },
});
