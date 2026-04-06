# Voice Note Playback Debug UX Design

## Goal
Add a compact verification step on the Capture screen so a user can replay the recorded voice note before tapping **Generate Draft**.

This is primarily for local debugging and confidence-building during capture, but the UX should be clean enough to keep if it proves useful.

## Scope
### In scope
- iOS/Expo mobile capture flow
- Playback of the currently recorded voice note before generation
- `Play / Pause` control
- `Re-record` control
- Re-record behavior that clears the current recording and returns the UI to the idle hold-to-record state
- Safe handling when playback is already active and the user chooses re-record
- Disabled interaction while upload/generate is in progress
- Basic playback failure handling via toast

### Out of scope
- Waveform visualization
- Scrubbing/seek bar
- Duration UI
- Multiple saved takes
- Persisting recordings beyond the current capture session
- Server changes
- Browser/e2e automation for this first pass unless needed for regression coverage later

## User Experience
### Idle state
The Voice Notes card shows the existing hold-to-record control.

### After recording completes
The card transitions into a recorded state that replaces the recorder CTA with:
- a `Play` button
- a `Pause` button while playback is active
- a `Re-record` action
- existing “Voice note saved” confirmation text can remain if it still fits the layout

### Re-record behavior
`Re-record` is the only removal action in V1.

When tapped, it should:
1. stop playback if it is currently active
2. discard the current recording URI from capture state
3. return the card to the idle record UI

There is no separate delete button.

### Busy state
When upload/generate is in progress:
- playback controls are disabled
- re-record is disabled
- current audio is preserved

### Failure state
If playback cannot start or fails unexpectedly:
- show a toast with a short actionable message
- preserve the recording so the user can still try again or re-record

## Technical Design
### Component structure
Keep the current architecture centered in `apps/mobile/app/capture.tsx` and `apps/mobile/components/VoiceRecorder.tsx`.

Recommended change:
- extend `VoiceRecorder` so it can render two modes:
  - **record mode** when no recording exists
  - **playback mode** when a recording URI exists
- pass the current `audioUri` into `VoiceRecorder`
- add an `onClearRecording()` callback for re-record
- keep `onRecordingComplete(uri)` for new recordings

This keeps the voice-note behavior encapsulated in one component instead of splitting the playback UI across the screen and the recorder.

### Audio playback
Use the existing `expo-audio` package for playback as well as recording.

Implementation direction:
- create a player from the current recording URI when a recording exists
- expose play/pause from the player
- stop/reset playback when:
  - the recording is cleared
  - a new recording replaces the old one
  - the component unmounts
- avoid introducing a second audio library

### State ownership
`capture.tsx` remains the owner of the canonical `audioUri` because it is part of the generate request payload.

`VoiceRecorder` owns ephemeral playback UI state such as:
- whether playback is active
- player lifecycle for the current URI

### Interaction rules
- Recording cannot begin while a saved recording is present; user must choose `Re-record`
- Playback cannot begin while generation/upload is busy
- If the user plays audio and then taps `Re-record`, playback must stop first and the player must be cleaned up before clearing the URI

## Error Handling
- permission-denied recording behavior remains unchanged
- playback start failure shows toast, not alert
- stale/invalid URI should fail gracefully and allow re-record
- playback errors must not block Generate if the recording URI still exists and upload is otherwise valid

## Testing Strategy
### Required for implementation
- mobile typecheck
- targeted unit/behavior coverage if a practical existing test seam exists
- manual local iOS verification:
  1. record voice note
  2. tap play and confirm audio plays
  3. tap pause and confirm playback stops
  4. tap re-record and confirm UI returns to idle record state
  5. record a new note and generate successfully
  6. confirm busy state disables playback actions during generate

### Deferred
- Maestro automation for playback controls
- browser coverage (not applicable to native recording playback)

## Risks and Mitigations
### Risk: audio session conflicts between recording and playback
Mitigation:
- explicitly stop/cleanup player instances before re-recording
- keep one active recording/player path at a time

### Risk: UI complexity on the capture screen
Mitigation:
- keep V1 minimal with only play/pause and re-record
- no waveform or progress UI

### Risk: playback API quirks in Expo dev client
Mitigation:
- reuse `expo-audio`, which is already in the app
- verify manually on the same local iOS simulator flow used for generation debugging

## Recommended Approach
Implement the minimal V1:
- `Play / Pause`
- `Re-record`
- re-record acts as delete-and-return-to-idle

This solves the immediate debugging/verification need with the smallest surface area and low regression risk.