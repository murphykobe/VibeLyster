import { useState } from "react";
import { View, Image, StyleSheet, ScrollView, Dimensions, Text } from "react-native";
import { theme } from "@/lib/theme";

const { width } = Dimensions.get("window");
const ITEM_WIDTH = width - 32;

type Props = { photos: string[] };

export default function PhotoCarousel({ photos }: Props) {
  const [current, setCurrent] = useState(0);

  if (!photos || photos.length === 0) {
    return (
      <View style={styles.placeholderWrap}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>No photos attached</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        pagingEnabled
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / ITEM_WIDTH);
          setCurrent(index);
        }}
      >
        {photos.map((uri, i) => (
          <View key={i} style={styles.item}>
            <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
          </View>
        ))}
      </ScrollView>

      <View style={styles.metaBar}>
        <Text style={styles.counter}>{current + 1}/{photos.length}</Text>
        {photos.length > 1 && (
          <View style={styles.dots}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  item: {
    width: ITEM_WIDTH,
    paddingHorizontal: 16,
  },
  photo: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceStrong,
  },
  placeholderWrap: {
    paddingHorizontal: 16,
  },
  placeholder: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    height: 220,
  },
  placeholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.sans,
  },
  metaBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  counter: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.sans,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    backgroundColor: theme.colors.accent,
    width: 14,
  },
});
