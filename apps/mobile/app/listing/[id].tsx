import { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, RefreshControl
} from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { getListing, updateListing, publishListing, delistListing, deleteListing, syncStatus } from "@/lib/api";
import type { Listing, Platform, PlatformListing } from "@/lib/types";
import PhotoCarousel from "@/components/PhotoCarousel";
import PlatformRow from "@/components/PlatformRow";

const CONDITIONS = ["new", "gently_used", "used", "heavily_used"];
const MVP_PLATFORMS: Platform[] = ["grailed", "depop"];

/** Merges the fixed platform list with any existing platform_listings rows.
 *  Platforms with no row yet are shown as pending so the user can initiate publish. */
function getMergedPlatformRows(listing: Listing): PlatformListing[] {
  const existing = listing.platform_listings ?? [];
  return MVP_PLATFORMS.map((platform) => {
    const row = existing.find((pl) => pl.platform === platform);
    if (row) return row;
    return {
      id: "",
      listing_id: listing.id,
      platform,
      platform_listing_id: null,
      status: "pending" as const,
      last_error: null,
      attempt_count: 0,
      published_at: null,
      last_synced_at: null,
    };
  });
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<Platform | null>(null);
  const [delisting, setDelisting] = useState<Platform | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getListing(id);
      setListing(data);
      setTitle(data.title);
      setPrice(String(data.price));
      setDescription(data.description);
      setSize(data.size ?? "");
      setCondition(data.condition ?? "");
      setBrand(data.brand ?? "");
      setCategory(data.category ?? "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSave() {
    setSaving(true);
    try {
      await updateListing(id, {
        title, description, price: Number(price), size, condition, brand, category,
      });
      await load();
    } catch (err) {
      Alert.alert("Error", "Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncStatus(id);
      setLastSynced(result.checkedAt);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePublish(platform: Platform) {
    setPublishing(platform);
    try {
      const result = await publishListing(id, [platform]);
      const pResult = result.results[platform] as { ok: boolean; error?: string };
      if (!pResult.ok) {
        Alert.alert("Publish failed", pResult.error ?? "Unknown error");
      }
      await load();
    } catch (err) {
      Alert.alert("Error", "Publish failed. Try again.");
    } finally {
      setPublishing(null);
    }
  }

  async function handlePublishAll() {
    const connectedPlatforms = (listing ? getMergedPlatformRows(listing) : [])
      .filter((pl) => pl.status !== "live" && pl.status !== "publishing")
      .map((pl) => pl.platform);
    if (connectedPlatforms.length === 0) return;
    setPublishingAll(true);
    try {
      await publishListing(id, connectedPlatforms);
      await load();
    } catch (err) {
      Alert.alert("Error", "Publish failed. Try again.");
    } finally {
      setPublishingAll(false);
    }
  }

  async function handleDelist(platform: Platform) {
    Alert.alert(
      `Delist from ${platform}`,
      "This will remove the listing from this platform. It will remain on others.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delist",
          style: "destructive",
          onPress: async () => {
            setDelisting(platform);
            try {
              await delistListing(id, platform);
              await load();
            } catch (err) {
              Alert.alert("Error", "Delist failed.");
            } finally {
              setDelisting(null);
            }
          },
        },
      ]
    );
  }

  async function handleDelete() {
    Alert.alert(
      "Delete listing",
      "This cannot be undone. Delist from all platforms first.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteListing(id);
              router.back();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "Unknown error";
              Alert.alert("Error", msg.includes("Delist") ? msg : "Delete failed.");
            }
          },
        },
      ]
    );
  }

  const platformRows = listing ? getMergedPlatformRows(listing) : [];
  const connectedNotLive = platformRows.filter(
    (pl) => pl.status !== "live" && pl.status !== "publishing"
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#fff" /></View>;
  }
  if (!listing) {
    return <View style={styles.center}><Text style={styles.errorText}>Listing not found.</Text></View>;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
      >
        {/* Photos */}
        <PhotoCarousel photos={listing.photos} />

        {/* Editable fields */}
        <View style={styles.fields}>
          <Field label="Title">
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor="#444" />
          </Field>
          <Field label="Price">
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholderTextColor="#444" />
          </Field>
          <Field label="Brand">
            <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholderTextColor="#444" />
          </Field>
          <Field label="Size">
            <TextInput style={styles.input} value={size} onChangeText={setSize} placeholderTextColor="#444" />
          </Field>
          <Field label="Condition">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.conditionPicker}>
                {CONDITIONS.map((c) => (
                  <Pressable key={c} onPress={() => setCondition(c)} style={[styles.conditionChip, condition === c && styles.conditionChipActive]}>
                    <Text style={[styles.conditionChipText, condition === c && styles.conditionChipTextActive]}>
                      {c.replace(/_/g, " ")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Field>
          <Field label="Description">
            <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline numberOfLines={4} placeholderTextColor="#444" />
          </Field>

          {/* Advanced */}
          <Pressable onPress={() => setShowAdvanced((p) => !p)} style={styles.advancedToggle}>
            <Text style={styles.advancedToggleText}>{showAdvanced ? "▼" : "▶"} Advanced</Text>
          </Pressable>
          {showAdvanced && (
            <Field label="Category">
              <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholderTextColor="#444" />
            </Field>
          )}
        </View>

        {/* Publish section */}
        <View style={styles.publishSection}>
          <View style={styles.publishHeader}>
            <Text style={styles.sectionTitle}>Publish</Text>
            {lastSynced && (
              <View style={styles.syncInfo}>
                <Text style={styles.syncText}>Last synced: {new Date(lastSynced).toLocaleTimeString()}</Text>
                <Pressable onPress={handleSync} disabled={syncing}>
                  <Text style={styles.syncBtn}>{syncing ? "…" : "↻"}</Text>
                </Pressable>
              </View>
            )}
            {!lastSynced && (
              <Pressable onPress={handleSync} disabled={syncing}>
                <Text style={styles.syncBtn}>{syncing ? "Syncing…" : "↻ Sync"}</Text>
              </Pressable>
            )}
          </View>

          {platformRows.map((pl) => (
            <PlatformRow
              key={pl.platform}
              platformListing={pl}
              onPublish={() => handlePublish(pl.platform)}
              onDelist={() => handleDelist(pl.platform)}
              onConnect={() => router.push(`/connect/${pl.platform}`)}
              publishing={publishing === pl.platform}
              delisting={delisting === pl.platform}
            />
          ))}

          {connectedNotLive.length > 1 && (
            <Pressable style={styles.publishAllBtn} onPress={handlePublishAll} disabled={publishingAll}>
              {publishingAll ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.publishAllText}>Publish to All Connected</Text>
              )}
            </Pressable>
          )}
        </View>

        {/* Delete */}
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete Listing</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  errorText: { color: "#888" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 56 },
  backBtn: { padding: 8 },
  backText: { color: "#fff", fontSize: 22 },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#111", borderRadius: 8 },
  saveBtnText: { color: "#fff", fontWeight: "600" },
  scroll: { paddingBottom: 60 },
  fields: { padding: 16, gap: 16 },
  field: { gap: 6 },
  fieldLabel: { color: "#555", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: "#111", borderRadius: 8, padding: 12, color: "#fff", fontSize: 15 },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  conditionPicker: { flexDirection: "row", gap: 8 },
  conditionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#111", borderWidth: 1, borderColor: "#222" },
  conditionChipActive: { backgroundColor: "#fff", borderColor: "#fff" },
  conditionChipText: { color: "#888", fontSize: 13 },
  conditionChipTextActive: { color: "#000" },
  advancedToggle: { paddingVertical: 4 },
  advancedToggleText: { color: "#555", fontSize: 13 },
  publishSection: { padding: 16, gap: 12 },
  publishHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  syncInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncText: { color: "#555", fontSize: 12 },
  syncBtn: { color: "#0099ff", fontSize: 15 },
  publishAllBtn: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  publishAllText: { color: "#000", fontWeight: "700", fontSize: 15 },
  deleteBtn: { margin: 16, marginTop: 32, padding: 16, borderWidth: 1, borderColor: "#330000", borderRadius: 12, alignItems: "center" },
  deleteText: { color: "#ff4444", fontSize: 15 },
});
