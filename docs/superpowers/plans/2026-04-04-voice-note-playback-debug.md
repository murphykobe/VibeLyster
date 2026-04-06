# Voice Note Playback Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact play/pause + re-record voice-note verification step on the mobile Capture screen before Generate Draft.

**Architecture:** Keep `apps/mobile/app/capture.tsx` as the owner of the saved `audioUri`, and extend `apps/mobile/components/VoiceRecorder.tsx` to render both record and playback states. Reuse `expo-audio` for playback so recording and playback stay in one library and re-record can clear the current note by resetting capture state.

**Tech Stack:** Expo Router, React Native, `expo-audio`, TypeScript, existing mobile toast/theme utilities

---

## File Structure

- Modify: `apps/mobile/components/VoiceRecorder.tsx`
  - Add playback-mode rendering when a saved `audioUri` exists
  - Manage `expo-audio` player lifecycle for the current URI
  - Support `Play / Pause` and `Re-record`
- Modify: `apps/mobile/app/capture.tsx`
  - Pass `audioUri` into `VoiceRecorder`
  - Pass a callback that clears the current recording and returns the UI to idle
  - Keep generate/upload busy state wired into the recorder/playback controls
- No server changes
- No schema changes
- No Maestro changes in V1

### Task 1: Wire the Capture screen for recorded-audio playback mode

**Files:**
- Modify: `apps/mobile/app/capture.tsx`
- Modify: `apps/mobile/components/VoiceRecorder.tsx`
- Verify: `cd apps/mobile && npx tsc --noEmit`

- [ ] **Step 1: Update the Capture screen call site to pass the current saved recording into `VoiceRecorder`**

Change the existing usage from:

```tsx
<VoiceRecorder onRecordingComplete={(uri) => setAudioUri(uri)} disabled={busy} />
```

to:

```tsx
<VoiceRecorder
  audioUri={audioUri}
  onRecordingComplete={(uri) => setAudioUri(uri)}
  onClearRecording={() => setAudioUri(null)}
  disabled={busy}
/>
```

- [ ] **Step 2: Remove the old inline post-record row from `capture.tsx` so playback UI lives in one component**

Delete this block from `apps/mobile/app/capture.tsx`:

```tsx
{audioUri && (
  <View style={styles.audioDoneRow}>
    <Text style={styles.audioDoneText}>Voice note saved</Text>
    <Pressable onPress={() => setAudioUri(null)}>
      <Text style={styles.rerecordText}>Re-record</Text>
    </Pressable>
  </View>
)}
```

Also delete the now-unused styles:

```tsx
audioDoneRow: {
  marginTop: 2,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},
audioDoneText: {
  color: theme.colors.success,
  fontFamily: theme.fonts.sansBold,
  fontSize: 12,
},
rerecordText: {
  color: theme.colors.textMuted,
  fontFamily: theme.fonts.sansBold,
  fontSize: 12,
},
```

- [ ] **Step 3: Run mobile typecheck to confirm the new props fail before implementation**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx tsc --noEmit
```

Expected: FAIL with TypeScript errors indicating `VoiceRecorder` does not yet accept `audioUri` / `onClearRecording` props.

- [ ] **Step 4: Commit the red-state call-site change**

```bash
git add apps/mobile/app/capture.tsx
git commit -m "test: add voice recorder playback props at capture call site"
```

### Task 2: Add playback mode to `VoiceRecorder`

**Files:**
- Modify: `apps/mobile/components/VoiceRecorder.tsx`
- Verify: `cd apps/mobile && npx tsc --noEmit`

- [ ] **Step 1: Extend `VoiceRecorder` props for saved-recording mode**

Replace the props type:

```tsx
type Props = {
  onRecordingComplete: (uri: string) => void;
  disabled?: boolean;
};
```

with:

```tsx
type Props = {
  audioUri: string | null;
  onRecordingComplete: (uri: string) => void;
  onClearRecording: () => void;
  disabled?: boolean;
};
```

and update the component signature to:

```tsx
export default function VoiceRecorder({
  audioUri,
  onRecordingComplete,
  onClearRecording,
  disabled,
}: Props) {
```

- [ ] **Step 2: Add `expo-audio` playback hooks and busy playback state**

Extend the imports in `apps/mobile/components/VoiceRecorder.tsx` from:

```tsx
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
```

to:

```tsx
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
```

Then initialize playback support near the top of the component:

```tsx
  const { showToast } = useToast();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const player = useAudioPlayer(audioUri, { updateInterval: 250 });
  const playerStatus = useAudioPlayerStatus(player);
```

- [ ] **Step 3: Add cleanup so re-record and unmount stop playback cleanly**

Add this effect after the pulse animation effects:

```tsx
  useEffect(() => {
    return () => {
      try {
        player.pause();
        player.remove();
      } catch {}
    };
  }, [player]);
```

Also stop playback if the saved recording disappears:

```tsx
  useEffect(() => {
    if (audioUri) return;
    try {
      player.pause();
      player.seekTo(0);
    } catch {}
  }, [audioUri, player]);
```

- [ ] **Step 4: Add playback and re-record handlers**

Insert these functions below `stopRecording()`:

```tsx
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

      if (playerStatus.didJustFinish) {
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
      await player.seekTo(0);
    } catch {}

    onClearRecording();
  }
```

- [ ] **Step 5: Replace the current single-mode render with record/playback branching**

Keep the current recorder UI for the no-recording case, but wrap it in a branch:

```tsx
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
```

Then add the playback-mode UI as the fallback return:

```tsx
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
```

- [ ] **Step 6: Add the new playback-mode styles**

Append these styles to `apps/mobile/components/VoiceRecorder.tsx`:

```tsx
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
```

- [ ] **Step 7: Run mobile typecheck to verify the implementation passes**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 8: Commit the playback-mode implementation**

```bash
git add apps/mobile/components/VoiceRecorder.tsx apps/mobile/app/capture.tsx
git commit -m "feat: add capture voice note playback controls"
```

### Task 3: Manual iOS verification

**Files:**
- Verify only: `apps/mobile/app/capture.tsx`
- Verify only: `apps/mobile/components/VoiceRecorder.tsx`

- [ ] **Step 1: Launch the local mobile stack**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npm run dev
```

In a second terminal:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx expo start --dev-client --port 8084
```

In a third terminal:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx expo run:ios --device "iPhone 16 Pro" --port 8084
```

Expected: app launches into the dev client.

- [ ] **Step 2: Verify play/pause on a saved recording**

Manual steps:
1. Open Capture
2. Hold the recorder and speak a short phrase
3. Release to save
4. Confirm the card now shows `Play` and `Re-record`
5. Tap `Play` and confirm audio plays back
6. Tap `Pause` and confirm playback stops

Expected: the recorded state works without crashing or leaving the app stuck in recording mode.

- [ ] **Step 3: Verify re-record behaves like delete-and-return-to-idle**

Manual steps:
1. With a saved note present, tap `Re-record`
2. Confirm the saved note UI disappears
3. Confirm the original hold-to-record UI returns
4. Record a second note
5. Tap `Play` and confirm the new note, not the old note, is what plays

Expected: the old note is cleared from capture state and playback resets to the new recording.

- [ ] **Step 4: Verify busy-state disabling during Generate Draft**

Manual steps:
1. Save a voice note
2. Add at least one photo
3. Tap `Generate Draft`
4. During upload/generation, confirm playback/re-record controls are disabled

Expected: the feature does not allow playback or reset interactions while generation is in progress.

- [ ] **Step 5: Commit after manual verification notes if any UI copy/style tweaks were needed**

If no further tweaks were needed, no new commit is required. If you made follow-up polish changes during manual verification:

```bash
git add apps/mobile/components/VoiceRecorder.tsx apps/mobile/app/capture.tsx
git commit -m "fix: polish capture voice note playback ui"
```

## Self-Review

- Spec coverage check:
  - Play/pause control: covered in Task 2
  - Re-record as delete-and-return-to-idle: covered in Tasks 1 and 2
  - Busy-state disable behavior: covered in Tasks 1, 2, and 3
  - Playback failure toast: covered in Task 2
  - Manual iOS verification: covered in Task 3
- Placeholder scan: no TBD/TODO placeholders remain
- Type consistency:
  - `audioUri` is consistently typed as `string | null`
  - `onClearRecording()` is used consistently as the re-record/delete callback
  - `togglePlayback()` and `handleReRecord()` match the planned behavior
