import { useState, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, ScrollView,
  ActivityIndicator, Alert
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { uploadPhoto, generateListing } from "@/lib/api";

type State = "idle" | "recording" | "uploading" | "generating";

export default function CaptureScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<{ uri: string; blobUrl?: string }[]>([]);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [state, setState] = useState<State>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);

  async function pickPhotos() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow photo access to select photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 8,
    });
    if (!result.canceled) {
      const newPhotos = result.assets.map((a) => ({ uri: a.uri }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 8));
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setPhotos((prev) => [...prev, { uri: result.assets[0].uri }].slice(0, 8));
    }
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setState("recording");
    } catch (err) {
      Alert.alert("Error", "Could not start recording.");
    }
  }

  async function stopRecording() {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setAudioUri(uri ?? null);
    setState("idle");
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleGenerate() {
    if (photos.length === 0 && !audioUri) {
      Alert.alert("Add photos or record a description first.");
      return;
    }

    try {
      setState("uploading");

      // Upload photos to Vercel Blob
      const blobUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        setUploadProgress(i);
        const url = await uploadPhoto(photos[i].uri);
        blobUrls.push(url);
      }

      setState("generating");
      const { listing } = await generateListing({ photoUrls: blobUrls, audioUri: audioUri ?? undefined });

      // Navigate to listing detail
      router.replace(`/listing/${listing.id}`);
    } catch (err) {
      console.error(err);
      Alert.alert("Generation failed", err instanceof Error ? err.message : "Try again.");
      setState("idle");
    }
  }

  const busy = state === "uploading" || state === "generating";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </Pressable>
        <Text style={styles.title}>New Listing</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Photos */}
        <View style={styles.photosSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoWrapper}>
                <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                <Pressable style={styles.removePhoto} onPress={() => removePhoto(i)}>
                  <Text style={styles.removePhotoText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {photos.length < 8 && (
              <View style={styles.addPhotoButtons}>
                <Pressable style={styles.addPhotoBtn} onPress={takePhoto}>
                  <Text style={styles.addPhotoBtnIcon}>📷</Text>
                  <Text style={styles.addPhotoBtnText}>Camera</Text>
                </Pressable>
                <Pressable style={styles.addPhotoBtn} onPress={pickPhotos}>
                  <Text style={styles.addPhotoBtnIcon}>🖼️</Text>
                  <Text style={styles.addPhotoBtnText}>Library</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
          <Text style={styles.photoCount}>{photos.length}/8 photos</Text>
        </View>

        {/* Voice recorder */}
        <View style={styles.voiceSection}>
          {audioUri ? (
            <View style={styles.audioDone}>
              <Text style={styles.audioDoneText}>✓ Voice note recorded</Text>
              <Pressable onPress={() => setAudioUri(null)}>
                <Text style={styles.rerecord}>Re-record</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={[styles.micBtn, state === "recording" && styles.micBtnRecording]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
            >
              <Text style={styles.micIcon}>{state === "recording" ? "⏹" : "🎤"}</Text>
              <Text style={styles.micLabel}>
                {state === "recording" ? "Release to stop" : "Hold to record"}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Status */}
        {busy && (
          <View style={styles.statusBox}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.statusText}>
              {state === "uploading"
                ? `Uploading photos (${uploadProgress + 1}/${photos.length})…`
                : "AI is generating your draft…"}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Generate button */}
      {!busy && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.generateBtn, (photos.length === 0 && !audioUri) && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={photos.length === 0 && !audioUri}
          >
            <Text style={styles.generateBtnText}>Generate Draft →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 56 },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backText: { color: "#888", fontSize: 18 },
  title: { color: "#fff", fontSize: 18, fontWeight: "700" },
  scroll: { padding: 16, gap: 24 },
  photosSection: { gap: 8 },
  photoStrip: { flexDirection: "row" },
  photoWrapper: { position: "relative", marginRight: 8 },
  photoThumb: { width: 100, height: 100, borderRadius: 8, backgroundColor: "#222" },
  removePhoto: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  removePhotoText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  addPhotoButtons: { flexDirection: "row", gap: 8 },
  addPhotoBtn: { width: 100, height: 100, borderRadius: 8, borderWidth: 1, borderColor: "#333", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4 },
  addPhotoBtnIcon: { fontSize: 24 },
  addPhotoBtnText: { color: "#555", fontSize: 12 },
  photoCount: { color: "#555", fontSize: 12 },
  voiceSection: { alignItems: "center" },
  micBtn: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#111", borderWidth: 2, borderColor: "#333", alignItems: "center", justifyContent: "center", gap: 4 },
  micBtnRecording: { borderColor: "#ff4444", backgroundColor: "#1a0000" },
  micIcon: { fontSize: 36 },
  micLabel: { color: "#555", fontSize: 11, textAlign: "center" },
  audioDone: { flexDirection: "row", alignItems: "center", gap: 16 },
  audioDoneText: { color: "#22cc66", fontSize: 15 },
  rerecord: { color: "#555", fontSize: 13 },
  statusBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#111", borderRadius: 12, padding: 16 },
  statusText: { color: "#888", fontSize: 14, flex: 1 },
  footer: { padding: 16, paddingBottom: 40 },
  generateBtn: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  generateBtnDisabled: { opacity: 0.4 },
  generateBtnText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
