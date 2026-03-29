import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import type { PlatformListing } from "@/lib/types";
import { theme } from "@/lib/theme";

type Props = {
  platformListing: PlatformListing;
  connected: boolean;
  onPublish: () => void;
  onDelist: () => void;
  onConnect: () => void;
  publishing?: boolean;
  delisting?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ready to publish",
  publishing: "Publishing",
  live: "Live",
  failed: "Needs retry",
  sold: "Sold",
  delisted: "Delisted",
};

const STATUS_COLORS: Record<string, string> = {
  live: theme.colors.success,
  sold: theme.colors.info,
  failed: theme.colors.danger,
  delisted: theme.colors.textMuted,
  publishing: theme.colors.warning,
  pending: theme.colors.textMuted,
};

export default function PlatformRow({
  platformListing,
  connected,
  onPublish,
  onDelist,
  onConnect,
  publishing,
  delisting,
}: Props) {
  const { platform, status } = platformListing;
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const statusLabel = STATUS_LABELS[status] ?? status;
  const statusColor = STATUS_COLORS[status] ?? theme.colors.textMuted;

  function renderAction() {
    if (!connected) {
      return (
        <Pressable onPress={onConnect} style={[styles.actionBtn, styles.actionLink]}>
          <Text style={[styles.actionText, styles.actionLinkText]}>Connect</Text>
        </Pressable>
      );
    }

    if (publishing || delisting) {
      return <ActivityIndicator size="small" color={theme.colors.accent} />;
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
          <Text style={[styles.actionText, styles.actionPrimaryText]}>{status === "failed" ? "Retry" : "Publish"}</Text>
        </Pressable>
      );
    }

    return null;
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
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  left: {
    flex: 1,
    gap: 4,
    paddingRight: 10,
  },
  platformName: {
    color: theme.colors.text,
    fontSize: 15,
    fontFamily: theme.fonts.sansBold,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  statusLabel: {
    fontSize: 13,
    fontFamily: theme.fonts.sans,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontFamily: theme.fonts.sans,
  },
  actionBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 86,
    alignItems: "center",
  },
  actionText: {
    fontSize: 12,
    fontFamily: theme.fonts.sansBold,
  },
  actionPrimary: {
    backgroundColor: theme.colors.accent,
  },
  actionPrimaryText: {
    color: theme.colors.white,
  },
  actionGhost: {
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.surface,
  },
  actionGhostText: {
    color: theme.colors.danger,
  },
  actionLink: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
  },
  actionLinkText: {
    color: theme.colors.info,
  },
  actionSpacer: {
    minWidth: 86,
  },
});
