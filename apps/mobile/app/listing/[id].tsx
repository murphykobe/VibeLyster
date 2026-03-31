import { useState, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { getListing, updateListing, publishListing, delistListing, deleteListing, syncStatus, getConnections } from "@/lib/api";
import type { Listing, MarketplaceConnection, Platform, PlatformListing } from "@/lib/types";
import PhotoCarousel from "@/components/PhotoCarousel";
import PlatformRow from "@/components/PlatformRow";
import { theme } from "@/lib/theme";

const CONDITIONS = ["new", "gently_used", "used", "heavily_used"];
const MVP_PLATFORMS: Platform[] = ["grailed", "depop"];

function confirmAction(title: string, message: string, confirmText = "Confirm") {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

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

  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState("");
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [traits, setTraits] = useState<Record<string, string>>({});

  function hydrateListing(data: Listing) {
    setListing(data);
    setTitle(data.title);
    setPrice(String(data.price));
    setDescription(data.description);
    setSize(data.size ?? "");
    setCondition(data.condition ?? "");
    setBrand(data.brand ?? "");
    setCategory(data.category ?? "");
    setTraits(data.traits ?? {});

    const newestSync = (data.platform_listings ?? [])
      .map((pl) => pl.last_synced_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    if (newestSync) setLastSynced(newestSync);
  }

  const load = useCallback(async () => {
    try {
      const data = await getListing(id);
      hydrateListing(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadConnections = useCallback(async () => {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const run = async () => {
        await Promise.all([load(), loadConnections()]);
        if (cancelled) return;
        setSyncing(true);
        try {
          const result = await syncStatus(id);
          if (cancelled) return;
          setLastSynced(result.checkedAt);
          const refreshed = await getListing(id);
          if (cancelled) return;
          hydrateListing(refreshed);
        } catch (err) {
          console.error(err);
        } finally {
          if (!cancelled) setSyncing(false);
        }
      };

      run();
      return () => {
        cancelled = true;
      };
    }, [id, load])
  );

  async function handleSave() {
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      Alert.alert("Invalid price", "Use a valid non-negative number.");
      return;
    }

    setSaving(true);
    try {
      await updateListing(id, {
        title,
        description,
        price: numericPrice,
        size,
        condition,
        brand,
        category,
        traits,
      });
      await load();
    } catch {
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
      const platformResult = result.results[platform] as { ok: boolean; error?: string };
      if (!platformResult.ok) {
        Alert.alert("Publish failed", platformResult.error ?? "Unknown error");
      }
      await load();
    } catch {
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
    } catch {
      Alert.alert("Error", "Publish failed. Try again.");
    } finally {
      setPublishingAll(false);
    }
  }

  async function handleDelistAll() {
    const livePlatforms = platformRows.filter((pl) => pl.status === "live").map((pl) => pl.platform);
    if (livePlatforms.length === 0) return;

    const confirmed = await confirmAction("Delist from all", `Remove from ${livePlatforms.join(", ")}?`, "Delist all");
    if (!confirmed) return;

    try {
      for (const platform of livePlatforms) {
        await delistListing(id, platform);
      }
      await load();
    } catch {
      Alert.alert("Error", "Delist all failed.");
    }
  }

  async function handleDelist(platform: Platform) {
    const confirmed = await confirmAction(
      `Delist from ${platform}`,
      "This removes the item from this platform only.",
      "Delist"
    );
    if (!confirmed) return;

    setDelisting(platform);
    try {
      await delistListing(id, platform);
      await load();
    } catch {
      Alert.alert("Error", "Delist failed.");
    } finally {
      setDelisting(null);
    }
  }

  async function handleDelete() {
    const confirmed = await confirmAction(
      "Delete listing",
      "This cannot be undone. Delist from all platforms first.",
      "Delete"
    );
    if (!confirmed) return;

    try {
      await deleteListing(id);
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      Alert.alert("Error", msg.includes("Delist") ? msg : "Delete failed.");
    }
  }

  const platformRows = listing ? getMergedPlatformRows(listing) : [];
  const connectedPlatforms = new Set<Platform>([
    ...(listing?.platform_listings ?? []).map((pl) => pl.platform as Platform),
    ...connections.map((c) => c.platform),
  ]);
  const connectedNotLive = platformRows.filter(
    (pl) => connectedPlatforms.has(pl.platform) && pl.status !== "live" && pl.status !== "publishing"
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Listing not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.accent} />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{title || "Untitled Listing"}</Text>
          <Text style={styles.heroSub}>Edit details and publish to marketplaces.</Text>
        </View>

        <PhotoCarousel photos={listing.photos} />

        <View style={styles.card}>
          <Field label="Title">
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={theme.colors.textMuted} />
          </Field>

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Field label="Price">
                <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} />
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="Brand">
                <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholderTextColor={theme.colors.textMuted} />
              </Field>
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Field label="Size">
                <TextInput style={styles.input} value={size} onChangeText={setSize} placeholderTextColor={theme.colors.textMuted} />
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="Category">
                <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholderTextColor={theme.colors.textMuted} />
              </Field>
            </View>
          </View>

          <Field label="Condition">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {CONDITIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCondition(item)}
                  style={[styles.conditionChip, condition === item && styles.conditionChipActive]}
                >
                  <Text style={[styles.conditionChipText, condition === item && styles.conditionChipTextActive]}>
                    {item.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <Field label="Description">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <Pressable onPress={() => setShowAdvanced((prev) => !prev)} style={styles.advancedToggle}>
            <Text style={styles.advancedToggleText}>{showAdvanced ? "Hide" : "Show"} advanced fields</Text>
          </Pressable>

          {showAdvanced && (
            <View style={styles.advancedWrap}>
              {Object.entries(traits).map(([key, value]) => (
                <Field key={key} label={key}>
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={(text) => setTraits((prev) => ({ ...prev, [key]: text }))}
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </Field>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.publishHeader}>
            <Text style={styles.sectionTitle}>Marketplace Publish</Text>
            <Pressable onPress={handleSync} disabled={syncing}>
              <Text style={styles.syncBtn}>{syncing ? "Syncing..." : "Refresh"}</Text>
            </Pressable>
          </View>

          {lastSynced && <Text style={styles.syncTime}>Last synced {new Date(lastSynced).toLocaleTimeString()}</Text>}

          <View style={styles.platformList}>
            {platformRows.map((platformListing) => (
              <PlatformRow
                key={platformListing.platform}
                platformListing={platformListing}
                connected={connectedPlatforms.has(platformListing.platform)}
                onPublish={() => handlePublish(platformListing.platform)}
                onDelist={() => handleDelist(platformListing.platform)}
                onConnect={() => router.push(`/connect/${platformListing.platform}`)}
                publishing={publishing === platformListing.platform}
                delisting={delisting === platformListing.platform}
              />
            ))}
          </View>

          {connectedNotLive.length > 1 && (
            <Pressable style={styles.publishAllBtn} onPress={handlePublishAll} disabled={publishingAll}>
              {publishingAll ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.publishAllText}>Publish to all connected</Text>
              )}
            </Pressable>
          )}

          {platformRows.some((pl) => pl.status === "live") && (
            <Pressable style={styles.delistAllBtn} onPress={handleDelistAll}>
              <Text style={styles.delistAllText}>Delist from all platforms</Text>
            </Pressable>
          )}
        </View>

        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete Listing</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bg,
  },
  errorText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    minWidth: 52,
  },
  backText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.fonts.sansBold,
  },
  saveBtn: {
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 72,
    alignItems: "center",
  },
  saveBtnText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  scroll: {
    paddingBottom: 48,
    gap: 14,
  },
  hero: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 34,
    lineHeight: 40,
  },
  heroSub: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 12,
    ...theme.shadow.card,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.sansBold,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  input: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
  },
  twoColItem: {
    flex: 1,
  },
  chipsRow: {
    gap: 8,
  },
  conditionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  conditionChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  conditionChipText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  conditionChipTextActive: {
    color: theme.colors.accent,
  },
  advancedToggle: {
    borderRadius: 999,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  advancedToggleText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  advancedWrap: {
    gap: 10,
  },
  publishHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 17,
  },
  syncBtn: {
    color: theme.colors.info,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  syncTime: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  platformList: {
    gap: 8,
  },
  publishAllBtn: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    paddingVertical: 12,
  },
  publishAllText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  delistAllBtn: {
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#F5B1A7",
    backgroundColor: "#FFE7E3",
    alignItems: "center",
    paddingVertical: 12,
  },
  delistAllText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  deleteBtn: {
    marginHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "#F5B1A7",
    backgroundColor: "#FFE7E3",
    alignItems: "center",
    paddingVertical: 13,
  },
  deleteText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
});
