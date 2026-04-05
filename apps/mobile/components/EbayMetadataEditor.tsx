import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import type { EbayListingMetadata } from "@/lib/types";
import { theme } from "@/lib/theme";

type Props = {
  metadata: EbayListingMetadata;
  visible: boolean;
  saving: boolean;
  onChange: (next: EbayListingMetadata) => void;
  onSave: () => void;
};

export default function EbayMetadataEditor({ metadata, visible, saving, onChange, onSave }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>eBay details</Text>
      <Text style={styles.copy}>Review or edit item-specific eBay fields before retrying publish.</Text>

      <Text style={styles.label}>Department</Text>
      <TextInput
        accessibilityLabel="Department"
        style={styles.input}
        value={metadata.ebayAspects?.Department?.[0] ?? ""}
        onChangeText={(value) => onChange({
          ...metadata,
          ebayAspects: {
            ...(metadata.ebayAspects ?? {}),
            Department: value ? [value] : [],
          },
          metadataSources: {
            ...(metadata.metadataSources ?? {}),
            Department: "user",
          },
        })}
        placeholder="Men / Women / Kids"
        placeholderTextColor={theme.colors.textMuted}
      />

      <Pressable style={styles.button} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Text style={styles.buttonText}>Save eBay details</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10,
    ...theme.shadow.raised,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 22,
  },
  copy: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 13,
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  input: {
    backgroundColor: theme.colors.surfaceStrong,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
  },
  button: {
    marginTop: 4,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    ...theme.shadow.raised,
  },
  buttonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
});
