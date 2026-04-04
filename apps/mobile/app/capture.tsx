import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import VoiceRecorder from "@/components/VoiceRecorder";
import { uploadPhoto, generateListing } from "@/lib/api";
import { theme } from "@/lib/theme";
import { useToast } from "@/lib/toast";

type State = "idle" | "uploading" | "generating";
type SelectedPhoto = Pick<ImagePicker.ImagePickerAsset, "uri" | "fileName" | "mimeType" | "file">;

export default function CaptureScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [state, setState] = useState<State>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newListingId, setNewListingId] = useState<string | null>(null);

  function appendPhotos(assets: ImagePicker.ImagePickerAsset[]) {
    const nextPhotos = assets.map((asset) => ({
      uri: asset.uri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      file: asset.file,
    }));
    setPhotos((prev) => [...prev, ...nextPhotos].slice(0, 8));
  }

  async function pickPhotos() {
    try {
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
        appendPhotos(result.assets);
      }
    } catch (err) {
      console.error("pickPhotos", err);
      showToast("Photo selection failed. Try a different image.");
    }
  }

  async function takePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Allow camera access to take photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!result.canceled) {
        appendPhotos(result.assets);
      }
    } catch (err) {
      console.error("takePhoto", err);
      showToast("Camera failed. Please try again.");
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForNewListing() {
    setPhotos([]);
    setAudioUri(null);
    setUploadProgress(0);
    setState("idle");
    setNewListingId(null);
  }

  async function handleGenerate() {
    if (photos.length === 0 && !audioUri) {
      Alert.alert("Add photos or record a description first.");
      return;
    }

    try {
      setState("uploading");

      const blobUrls: string[] = [];
      for (let i = 0; i < photos.length; i += 1) {
        setUploadProgress(i + 1);
        const url = await uploadPhoto(photos[i]);
        blobUrls.push(url);
      }

      setState("generating");
      const { listing } = await generateListing({
        photoUrls: blobUrls,
        audioUri: audioUri ?? undefined,
      });

      setNewListingId(listing.id);
      setState("idle");
    } catch (err) {
      console.error(err);
      showToast(err instanceof Error ? err.message : "Generation failed. Try again.");
      setState("idle");
    }
  }

  const busy = state === "uploading" || state === "generating";

  if (newListingId) {
    return (
      <SafeAreaView style={styles.donePage} edges={["top"]}>
        <Text style={styles.doneKicker}>Saved</Text>
        <Text style={styles.doneTitle}>Draft Ready</Text>
        <Text style={styles.doneSubtitle}>Now review details or jump right into your next listing.</Text>

        <View style={styles.doneActions}>
          <Pressable style={styles.donePrimary} onPress={() => router.push(`/listing/${newListingId}`)}>
            <Text style={styles.donePrimaryText}>Review & Edit</Text>
          </Pressable>
          <Pressable style={styles.doneSecondary} onPress={resetForNewListing}>
            <Text style={styles.doneSecondaryText}>+ New Listing</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Capture</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Build a listing in under a minute</Text>
          <Text style={styles.heroSub}>Add photos, describe the item, and let AI draft the copy.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <Text style={styles.sectionMeta}>{photos.length}/8</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                <Pressable style={styles.removePhoto} onPress={() => removePhoto(index)}>
                  <Text style={styles.removePhotoText}>×</Text>
                </Pressable>
              </View>
            ))}

            {photos.length < 8 && (
              <>
                <Pressable style={styles.addPhotoBtn} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={20} color={theme.colors.accent} />
                  <Text style={styles.addPhotoLabel}>Camera</Text>
                </Pressable>
                <Pressable style={styles.addPhotoBtn} onPress={pickPhotos}>
                  <Ionicons name="images-outline" size={20} color={theme.colors.accent} />
                  <Text style={styles.addPhotoLabel}>Library</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Voice Notes</Text>
            <Text style={styles.sectionMeta}>{audioUri ? "Recorded" : "Optional"}</Text>
          </View>

          <VoiceRecorder onRecordingComplete={(uri) => setAudioUri(uri)} disabled={busy} />

          {audioUri && (
            <View style={styles.audioDoneRow}>
              <Text style={styles.audioDoneText}>Voice note saved</Text>
              <Pressable onPress={() => setAudioUri(null)}>
                <Text style={styles.rerecordText}>Re-record</Text>
              </Pressable>
            </View>
          )}
        </View>

        {busy && (
          <View style={styles.statusBox}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.statusText}>
              {state === "uploading"
                ? `Uploading photos (${uploadProgress}/${photos.length})`
                : "Generating listing draft"}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.generateBtn, photos.length === 0 && !audioUri && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={photos.length === 0 && !audioUri || busy}
        >
          {busy ? (
            <ActivityIndicator color={theme.colors.white} />
          ) : (
            <Text style={styles.generateBtnText}>Generate Draft</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    minWidth: 48,
  },
  backText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 24,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  hero: {
    paddingVertical: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 32,
    lineHeight: 38,
  },
  heroSub: {
    marginTop: 8,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    gap: 12,
    ...theme.shadow.card,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 16,
  },
  sectionMeta: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  photoRow: {
    gap: 8,
  },
  photoWrap: {
    position: "relative",
  },
  photoThumb: {
    width: 108,
    height: 108,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
  },
  removePhoto: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31, 36, 48, 0.78)",
  },
  removePhotoText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
    marginTop: -1,
  },
  addPhotoBtn: {
    width: 108,
    height: 108,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    backgroundColor: theme.colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addPhotoLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
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
  statusBox: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statusText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 22,
  },
  generateBtn: {
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  generateBtnDisabled: {
    opacity: 0.45,
  },
  generateBtnText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  donePage: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  doneKicker: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: 12,
  },
  doneTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 44,
    lineHeight: 52,
  },
  doneSubtitle: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  doneActions: {
    width: "100%",
    marginTop: 12,
    gap: 10,
  },
  donePrimary: {
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    paddingVertical: 14,
  },
  donePrimaryText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  doneSecondary: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    paddingVertical: 14,
  },
  doneSecondaryText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
});
