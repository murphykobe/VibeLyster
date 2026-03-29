import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";

type Props = {
  onRecordingComplete: (uri: string) => void;
  disabled?: boolean;
};

export default function VoiceRecorder({ onRecordingComplete, disabled }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    if (disabled || recording) return;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 420, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        ])
      ).start();
    } catch {
      setRecording(null);
      setDuration(0);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pulse.stopAnimation();
    pulse.setValue(1);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) onRecordingComplete(uri);
    } finally {
      setRecording(null);
      setDuration(0);
    }
  }

  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <Pressable
      disabled={disabled}
      onPressIn={startRecording}
      onPressOut={stopRecording}
      style={[styles.container, disabled && styles.disabled]}
    >
      <Animated.View
        style={[
          styles.outerRing,
          recording && styles.outerRingRecording,
          { transform: [{ scale: pulse }] },
        ]}
      >
        <View style={[styles.button, recording && styles.buttonRecording]}>
          <Ionicons
            name={recording ? "mic" : "mic-outline"}
            size={30}
            color={recording ? theme.colors.white : theme.colors.accent}
          />
        </View>
      </Animated.View>

      <Text style={[styles.mainLabel, recording && styles.mainLabelRecording]}>
        {recording ? `${mins}:${secs.toString().padStart(2, "0")}` : "Hold to describe item"}
      </Text>
      <Text style={styles.subLabel}>
        {recording ? "Release to save" : "Mention brand, size, condition, and price"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  outerRing: {
    width: 136,
    height: 136,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  outerRingRecording: {
    backgroundColor: "#FFDAD5",
    borderColor: "#F9B8AC",
  },
  button: {
    width: 104,
    height: 104,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRecording: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  mainLabel: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  mainLabelRecording: {
    color: theme.colors.danger,
  },
  subLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
});
