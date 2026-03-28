import { View, Image, StyleSheet, ScrollView, Dimensions, Text } from "react-native";
import { useState } from "react";

const { width } = Dimensions.get("window");

type Props = { photos: string[] };

export default function PhotoCarousel({ photos }: Props) {
  const [current, setCurrent] = useState(0);

  if (!photos || photos.length === 0) {
    return <View style={styles.placeholder}><Text style={styles.placeholderText}>No photos</Text></View>;
  }

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrent(index);
        }}
      >
        {photos.map((uri, i) => (
          <Image key={i} source={{ uri }} style={styles.photo} resizeMode="cover" />
        ))}
      </ScrollView>
      {photos.length > 1 && (
        <View style={styles.dots}>
          {photos.map((_, i) => (
            <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width, height: width, backgroundColor: "#111" },
  placeholder: { width, height: 200, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "#555" },
  dots: { flexDirection: "row", justifyContent: "center", paddingVertical: 8, gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#333" },
  dotActive: { backgroundColor: "#fff" },
});
