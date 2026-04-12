import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, TextInput } from "react-native";
import type { TraitOption } from "@/lib/listing-traits";
import { theme } from "@/lib/theme";

type Props = {
  traitKey: string;
  label: string;
  value: string;
  options: TraitOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  helperText?: string | null;
  onChange: (value: string) => void;
};

function toTestId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function TraitPickerField({
  traitKey,
  label,
  value,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  searchPlaceholder,
  helperText,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value);
  const rawValue = value.trim();
  const displayValue = selected?.label || rawValue || placeholder;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        disabled={disabled}
        style={[styles.trigger, disabled && styles.disabled]}
        testID={`trait-picker-${traitKey}-trigger`}
      >
        <Text style={selected || rawValue ? styles.triggerValue : styles.triggerPlaceholder}>
          {displayValue}
        </Text>
        <Text style={styles.triggerIcon}>{open ? "Hide" : "Select"}</Text>
      </Pressable>

      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

      {open ? (
        <View style={styles.panel}>
          {searchable ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}`}
              placeholderTextColor={theme.colors.textMuted}
              editable={!disabled}
              testID={`trait-picker-${traitKey}-search`}
            />
          ) : null}

          <ScrollView style={styles.optionsScroll} nestedScrollEnabled>
            <View style={styles.optionsWrap}>
              {filteredOptions.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setQuery("");
                      setOpen(false);
                    }}
                    disabled={disabled}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    testID={`trait-picker-${traitKey}-option-${toTestId(option.value)}`}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {value ? (
            <Pressable
              onPress={() => {
                onChange("");
                setQuery("");
              }}
              disabled={disabled}
              style={styles.clearButton}
              testID={`trait-picker-${traitKey}-clear`}
            >
              <Text style={styles.clearButtonText}>Clear {label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  trigger: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  disabled: {
    opacity: 0.6,
  },
  triggerValue: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  triggerPlaceholder: {
    flex: 1,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  triggerIcon: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  panel: {
    gap: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 10,
  },
  searchInput: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  optionsScroll: {
    maxHeight: 220,
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionChip: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionChipActive: {
    backgroundColor: theme.colors.accent,
  },
  optionText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  optionTextActive: {
    color: theme.colors.white,
  },
  clearButton: {
    alignSelf: "flex-start",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
});
