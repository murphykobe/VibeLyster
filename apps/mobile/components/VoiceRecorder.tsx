import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";

type Props = {
  onRecordingComplete: (uri: string) => void;
  disabled?: boolean;
};

export default function VoiceRecorder({ onRecordingComplete, disabled }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    return () => {
      pulseAnimationRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (recorderState.isRecording) {
      pulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.08, duration: 420, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        ])
      );
      pulseAnimationRef.current.start();
      return;
    }

    pulseAnimationRef.current?.stop();
    pulse.setValue(1);
  }, [pulse, recorderState.isRecording]);

  async function startRecording() {
    if (disabled || recorderState.isRecording) return;

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return;

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      pulseAnimationRef.current?.stop();
      pulse.setValue(1);
    }
  }

  async function stopRecording() {
    if (!recorderState.isRecording) return;

    try {
      await recorder.stop();
      const uri = recorder.uri ?? recorderState.url;
      if (uri) onRecordingComplete(uri);
    } catch {}
  }

  const durationSeconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;

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
          recorderState.isRecording && styles.outerRingRecording,
          { transform: [{ scale: pulse }] },
        ]}
      >
        <View style={[styles.button, recorderState.isRecording && styles.buttonRecording]}>
          <Ionicons
            name={recorderState.isRecording ? "mic" : "mic-outline"}
            size={30}
            color={recorderState.isRecording ? theme.colors.white : theme.colors.accent}
          />
        </View>
      </Animated.View>

      <Text style={[styles.mainLabel, recorderState.isRecording && styles.mainLabelRecording]}>
        {recorderState.isRecording
          ? `${mins}:${secs.toString().padStart(2, "0")}`
          : "Hold to describe item"}
      </Text>
      <Text style={styles.subLabel}>
        {recorderState.isRecording ? "Release to save" : "Mention brand, size, condition, and price"}
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
    borderRadius: 68,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    ...theme.shadow.raisedStrong,
  },
  outerRingRecording: {
    shadowColor: "#DC2626",
    shadowOpacity: 0.4,
  },
  button: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: theme.colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonRecording: {
    backgroundColor: theme.colors.danger,
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
