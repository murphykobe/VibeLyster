import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { useToast } from "@/lib/toast";

function logVoiceRecorderEvent(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data }));
}

type Props = {
  audioUri: string | null;
  onRecordingComplete: (uri: string) => void;
  onClearRecording: () => void;
  disabled?: boolean;
};

export default function VoiceRecorder({
  audioUri,
  onRecordingComplete,
  onClearRecording,
  disabled,
}: Props) {
  const { showToast } = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(audioUri, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);
  const pulse = useRef(new Animated.Value(1)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    return () => {
      pulseAnimationRef.current?.stop();
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

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
    logVoiceRecorderEvent("voice.record.start_requested", {
      disabled: Boolean(disabled),
      hasSavedAudio: Boolean(audioUri),
      isRecording: recorderState.isRecording,
    });

    if (disabled || audioUri || recorderState.isRecording) {
      logVoiceRecorderEvent("voice.record.start_ignored", {
        disabled: Boolean(disabled),
        hasSavedAudio: Boolean(audioUri),
        isRecording: recorderState.isRecording,
      });
      return;
    }

    const permission = await AudioModule.requestRecordingPermissionsAsync();
    logVoiceRecorderEvent("voice.record.permission_result", {
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      status: permission.status,
    });
    if (!permission.granted) {
      showToast("Microphone permission is required to record.");
      return;
    }

    try {
      logVoiceRecorderEvent("voice.record.preparing");
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      logVoiceRecorderEvent("voice.record.started");
    } catch (error) {
      pulseAnimationRef.current?.stop();
      pulse.setValue(1);
      console.error(JSON.stringify({
        event: "voice.record.start_failed",
        message: error instanceof Error ? error.message : String(error),
      }));
      showToast("Couldn’t start recording. Check microphone access and try again.");
    }
  }

  async function stopRecording() {
    logVoiceRecorderEvent("voice.record.stop_requested", {
      isRecording: recorderState.isRecording,
    });

    if (!recorderState.isRecording) {
      logVoiceRecorderEvent("voice.record.stop_ignored", {
        reason: "not_recording",
      });
      return;
    }

    try {
      await recorder.stop();
      const uri = recorder.uri ?? recorderState.url;
      if (uri) {
        logVoiceRecorderEvent("voice.record.saved", {
          hasUri: true,
        });
        onRecordingComplete(uri);
        return;
      }

      logVoiceRecorderEvent("voice.record.saved_empty", {
        hasUri: false,
      });
      showToast("Recording saved without audio. Try again.");
    } catch (error) {
      console.error(JSON.stringify({
        event: "voice.record.stop_failed",
        message: error instanceof Error ? error.message : String(error),
      }));
      showToast("Couldn’t finish recording. Try again.");
    }
  }

  async function togglePlayback() {
    if (disabled || !audioUri) return;

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      if (playerStatus.playing) {
        player.pause();
        return;
      }

      const isFinished = playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration;
      if (isFinished) {
        await player.seekTo(0);
      }

      player.play();
    } catch {
      showToast("Playback failed. Try re-recording the note.");
    }
  }

  async function handleReRecord() {
    try {
      player.pause();
      if (playerStatus.currentTime > 0) {
        await player.seekTo(0);
      }
    } catch {}

    onClearRecording();
  }

  const durationSeconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;

  if (!audioUri) {
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

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <View style={styles.savedBadgeRow}>
        <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
        <Text style={styles.savedText}>Voice note saved</Text>
      </View>

      <Pressable style={styles.playbackButton} onPress={togglePlayback} disabled={disabled}>
        <Ionicons
          name={playerStatus.playing ? "pause" : "play"}
          size={18}
          color={theme.colors.white}
        />
        <Text style={styles.playbackButtonText}>{playerStatus.playing ? "Pause" : "Play"}</Text>
      </Pressable>

      <Pressable onPress={handleReRecord} disabled={disabled}>
        <Text style={styles.rerecordText}>Re-record</Text>
      </Pressable>
    </View>
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
  savedBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  savedText: {
    color: theme.colors.success,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  playbackButton: {
    minWidth: 132,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accent,
    ...theme.shadow.raised,
  },
  playbackButtonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  rerecordText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
});
