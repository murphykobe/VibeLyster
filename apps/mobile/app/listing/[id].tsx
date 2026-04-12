import { useState, useEffect, useCallback, type ReactNode } from "react";
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
import { getListing, updateListing, publishListing, delistListing, deleteListing, syncStatus, getConnections, saveEbayListingMetadata } from "@/lib/api";
import { getListingVerificationStatus, getRemoteListingState, type EbayListingMetadata, type Listing, type MarketplaceConnection, type Platform, type PlatformListing } from "@/lib/types";
import TraitPickerField from "@/components/TraitPickerField";
import { CATEGORY_GROUPS, getCategoryOption } from "@/lib/categories";
import { getPublishMode, type PublishMode } from "@/lib/publish-mode";
import {
  ALL_SIZE_SYSTEMS,
  getSizeFieldLabel,
  getSizeSystemLabel,
  getSizeSystemsForCategory,
  getTraitLabel,
  getValuesForSystem,
  isTopCategory,
  parseStructuredSize,
  toDisplaySize,
  translateApparelSizeToTopSize,
  type SizeSystem,
} from "@/lib/sizes";
import PhotoCarousel from "@/components/PhotoCarousel";
import PlatformRow from "@/components/PlatformRow";
import EbayMetadataEditor from "@/components/EbayMetadataEditor";
import { theme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import {
  formatPublishFeedbackMessage,
  getSelectableTraitOptions,
  isSelectableTraitKey,
  normalizeEditableTraits,
} from "@/lib/listing-traits";

const CONDITIONS = ["new", "gently_used", "used", "heavily_used"];
const MVP_PLATFORMS: Platform[] = ["grailed", "depop", "ebay"];

function normalizeSizeValue(system: SizeSystem, value: string) {
  const trimmed = value.trim();
  return system === "CLOTHING_LETTER" || system === "ONE_SIZE" ? trimmed.toUpperCase() : trimmed;
}

function parseListingSize(size: Listing["size"], categoryKey: string | null | undefined) {
  const parsed = parseStructuredSize(size);
  if (parsed) {
    if (isTopCategory(categoryKey)) {
      const translated = translateApparelSizeToTopSize(parsed.system, parsed.value);
      if (translated) {
        return { system: "CLOTHING_LETTER", value: translated, legacy: false };
      }
    }
    return { system: parsed.system, value: parsed.value, legacy: false };
  }

  const legacyValue = toDisplaySize(size) ?? "";
  if (!legacyValue) return { system: "", value: "", legacy: false };

  const candidateSystems = getSizeSystemsForCategory(categoryKey).filter((system) =>
    getValuesForSystem(system).includes(normalizeSizeValue(system, legacyValue))
  );
  if (candidateSystems.length === 1) {
    return {
      system: candidateSystems[0],
      value: normalizeSizeValue(candidateSystems[0], legacyValue),
      legacy: false,
    };
  }

  return { system: "", value: legacyValue, legacy: true };
}

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
      platform_data: {},
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
  const { showToast } = useToast();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<Platform | null>(null);
  const [delisting, setDelisting] = useState<Platform | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>("live");
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const [showEbayMetadata, setShowEbayMetadata] = useState(false);
  const [savingEbayMetadata, setSavingEbayMetadata] = useState(false);
  const [ebayMetadata, setEbayMetadata] = useState<EbayListingMetadata>({});

  const [connections, setConnections] = useState<MarketplaceConnection[]>([]);

  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sizeSystem, setSizeSystem] = useState("");
  const [sizeValue, setSizeValue] = useState("");
  const [legacySize, setLegacySize] = useState<string | null>(null);
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [acceptOffers, setAcceptOffers] = useState(false);
  const [traits, setTraits] = useState<Record<string, string>>({});

  function hydrateListing(data: Listing) {
    setListing(data);
    setTitle(data.title ?? "");
    setPrice(data.price == null ? "" : String(data.price));
    setDescription(data.description ?? "");
    const parsedSize = parseListingSize(data.size, data.category);
    setSizeSystem(parsedSize.system);
    setSizeValue(parsedSize.value);
    setLegacySize(parsedSize.legacy ? parsedSize.value : null);
    setCondition(data.condition ?? "");
    setBrand(data.brand ?? "");
    setCategory(data.category ?? "");
    setAcceptOffers((data.traits?.accept_offers ?? "false") === "true");
    setTraits(normalizeEditableTraits(data.traits ?? {}));

    const ebayPlatform = (data.platform_listings ?? []).find((row) => row.platform === "ebay");
    setEbayMetadata((ebayPlatform?.platform_data ?? {}) as EbayListingMetadata);

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
      showToast("Failed to load listing.");
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  const loadConnections = useCallback(async () => {
    try {
      const data = await getConnections();
      setConnections(data);
    } catch (err) {
      console.error(err);
      showToast("Failed to load connections.");
    }
  }, [showToast]);

  const loadPublishMode = useCallback(async () => {
    try {
      setPublishMode(await getPublishMode());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const run = async () => {
        await Promise.all([load(), loadConnections(), loadPublishMode()]);
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
    }, [id, load, loadConnections, loadPublishMode])
  );

  useEffect(() => {
    if (listing?.generation_status !== "generating") return;

    let cancelled = false;
    const interval = setInterval(() => {
      void (async () => {
        try {
          const result = await syncStatus(id);
          if (cancelled) return;
          setLastSynced(result.checkedAt);
          if (result.generation_status !== "generating") {
            await load();
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, listing?.generation_status, load]);

  useEffect(() => {
    if (!sizeSystem || !(sizeSystem in ALL_SIZE_SYSTEMS)) return;
    const normalizedValue = normalizeSizeValue(sizeSystem as SizeSystem, sizeValue);
    if (!normalizedValue) return;
    if (normalizedValue !== sizeValue) {
      setSizeValue(normalizedValue);
    }
  }, [sizeSystem, sizeValue]);

  useEffect(() => {
    if (!sizeSystem) return;
    const sizeSystems = getSizeSystemsForCategory(category || CATEGORY_GROUPS[0].key);
    if (sizeSystems.length > 0 && !sizeSystems.includes(sizeSystem as SizeSystem)) {
      if (sizeValue) setLegacySize(sizeValue);
      setSizeSystem("");
    }
  }, [category, sizeSystem]);

  async function handleSave() {
    const numericPrice = Number(price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      Alert.alert("Invalid price", "Use a valid non-negative number.");
      return;
    }

    const nextSize = sizeSystem && sizeValue
      ? { system: sizeSystem, value: normalizeSizeValue(sizeSystem as SizeSystem, sizeValue) }
      : sizeValue.trim()
        ? sizeValue.trim()
        : null;

    const nextTraits = {
      ...traits,
      accept_offers: acceptOffers ? "true" : "false",
    };

    setSaving(true);
    try {
      await updateListing(id, {
        title,
        description,
        price: numericPrice,
        size: nextSize,
        condition,
        brand,
        category,
        traits: nextTraits,
      });
      setPublishFeedback(null);
      await load();
    } catch {
      showToast("Failed to save. Try again.");
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
      showToast("Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePublish(platform: Platform) {
    setPublishing(platform);
    try {
      const result = await publishListing(id, [platform], publishMode);
      const platformResult = result.results[platform] as {
        ok: boolean;
        error?: string;
        remoteState?: "live" | "draft";
        metadataRequired?: boolean;
        platformData?: Record<string, unknown>;
      };
      if (!platformResult.ok) {
        if (platform === "ebay") {
          setShowEbayMetadata(true);
          if (platformResult.platformData) {
            setEbayMetadata(platformResult.platformData as EbayListingMetadata);
          }
        }
        const message = formatPublishFeedbackMessage(platform, platformResult.error);
        setPublishFeedback(message);
        showToast(message);
      } else {
        setPublishFeedback(null);
        if (platformResult.remoteState === "draft") {
          showToast(`${platform} draft created.`, "success");
        }
      }
      await load();
    } catch {
      setPublishFeedback(formatPublishFeedbackMessage(platform));
      showToast("Publish failed. Try again.");
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
      const result = await publishListing(id, connectedPlatforms, publishMode);
      const firstFailure = connectedPlatforms.find((platform) => {
        const platformResult = result.results[platform] as { ok?: boolean } | undefined;
        return platformResult?.ok === false;
      });
      if (firstFailure) {
        const platformResult = result.results[firstFailure] as { error?: string } | undefined;
        const message = formatPublishFeedbackMessage(firstFailure, platformResult?.error);
        setPublishFeedback(message);
        showToast(message);
      } else {
        setPublishFeedback(null);
      }
      await load();
    } catch {
      setPublishFeedback("Publish failed. Try again.");
      showToast("Publish failed. Try again.");
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
      showToast("Delist all failed.");
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
      showToast("Delist failed.");
    } finally {
      setDelisting(null);
    }
  }

  async function handleSaveEbayMetadata() {
    setSavingEbayMetadata(true);
    try {
      await saveEbayListingMetadata(id, ebayMetadata);
      setShowEbayMetadata(true);
      await load();
      showToast("Saved eBay details.", "success");
    } catch {
      showToast("Failed to save eBay details.");
    } finally {
      setSavingEbayMetadata(false);
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
      showToast(msg.includes("Delist") ? msg : "Delete failed.");
    }
  }

  const platformRows = listing ? getMergedPlatformRows(listing) : [];
  const verificationStatus = listing ? getListingVerificationStatus(listing) : "verified";
  const connectedPlatforms = new Set<Platform>([
    ...(listing?.platform_listings ?? []).map((pl) => pl.platform as Platform),
    ...connections.map((c) => c.platform),
  ]);
  const connectedNotLive = platformRows.filter(
    (pl) => connectedPlatforms.has(pl.platform) && pl.status !== "live" && pl.status !== "publishing"
  );
  const selectedCategoryOption = getCategoryOption(category);
  const visibleCategoryGroup = selectedCategoryOption?.group ?? CATEGORY_GROUPS[0].key;
  const visibleCategoryOptions = CATEGORY_GROUPS.find((group) => group.key === visibleCategoryGroup)?.options ?? [];
  const sizeSystemOptions = getSizeSystemsForCategory(visibleCategoryGroup);
  const sizeValueOptions = sizeSystem && sizeSystem in ALL_SIZE_SYSTEMS
    ? getValuesForSystem(sizeSystem as SizeSystem)
    : [];
  const mainTraitKeys = ["color", "country_of_origin"] as const;
  const editableTraitKeys = Array.from(new Set(Object.keys(traits).filter((key) => key !== "accept_offers" && !mainTraitKeys.includes(key as typeof mainTraitKeys[number]))));
  const sizeFieldLabel = getSizeFieldLabel(visibleCategoryGroup);
  const editingDisabled = listing?.generation_status === "generating";

  function getPublishLabel(platformListing: PlatformListing) {
    const remoteState = getRemoteListingState(platformListing);
    if (publishMode === "draft") {
      return remoteState === "draft" ? "Update Draft" : "Save Draft";
    }
    if (remoteState === "draft") return "Go Live";
    return platformListing.status === "failed" ? "Retry" : "Publish";
  }

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
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.accent} />}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{title || "Untitled Listing"}</Text>
          <Text style={styles.heroSub}>
            Edit details and {publishMode === "draft" ? "save marketplace drafts." : "publish to marketplaces."}
          </Text>
          {listing.generation_status === "generating" ? (
            <View style={styles.statusBanner}>
              <ActivityIndicator size="small" color={theme.colors.white} />
              <Text style={styles.statusBannerText}>Generating listing details. Editing is disabled until the draft is ready.</Text>
            </View>
          ) : null}
          {listing.generation_status === "failed" ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{listing.generation_error || "Draft generation failed."}</Text>
            </View>
          ) : null}
          {verificationStatus === "requires_verification" ? (
            <View style={styles.verificationBadge}>
              <Text style={styles.verificationBadgeText}>Requires verification</Text>
            </View>
          ) : null}
        </View>

        <PhotoCarousel photos={listing.photos} />

        <View style={styles.card}>
          <Field label="Title">
            <TextInput
              style={[styles.input, editingDisabled && styles.inputDisabled]}
              value={title}
              onChangeText={setTitle}
              editable={!editingDisabled}
              placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Field label="Price">
                <TextInput
                  style={[styles.input, editingDisabled && styles.inputDisabled]}
                  value={price}
                  onChangeText={setPrice}
                  editable={!editingDisabled}
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.textMuted}
                />
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="Brand">
                <TextInput
                  style={[styles.input, editingDisabled && styles.inputDisabled]}
                  value={brand}
                  onChangeText={setBrand}
                  editable={!editingDisabled}
                  placeholderTextColor={theme.colors.textMuted}
                />
              </Field>
            </View>
          </View>

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Field label={sizeFieldLabel}>
                <Text style={styles.categorySummary}>
                  {sizeSystem && sizeValue
                    ? `${getSizeSystemLabel(sizeSystem as SizeSystem, visibleCategoryGroup)} / ${sizeValue}`
                    : legacySize || sizeValue
                      ? `Legacy size: ${legacySize || sizeValue}`
                      : `Choose ${sizeFieldLabel.toLowerCase()} and value`}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {sizeSystemOptions.map((system) => (
                    <Pressable
                      key={system}
                      onPress={() => {
                        if (editingDisabled) return;
                        setSizeSystem(system);
                        setLegacySize(null);
                        setSizeValue((current) => normalizeSizeValue(system, current));
                      }}
                      disabled={editingDisabled}
                      style={[styles.chip, sizeSystem === system && styles.chipActive, editingDisabled && styles.buttonDisabled]}
                    >
                      <Text style={[styles.chipText, sizeSystem === system && styles.chipTextActive]}>
                        {getSizeSystemLabel(system, visibleCategoryGroup)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {legacySize || (!sizeSystem && sizeValue) ? (
                  <Text style={styles.selectorHelper}>Existing free-form size kept for compatibility. Pick a size system to standardize it.</Text>
                ) : null}
                {sizeSystem ? (
                  <>
                    <TextInput
                      style={[styles.input, editingDisabled && styles.inputDisabled]}
                      value={sizeValue}
                      onChangeText={(value) => {
                        setSizeValue(value);
                        setLegacySize(null);
                      }}
                      editable={!editingDisabled}
                      autoCapitalize="characters"
                      placeholder={`Enter ${sizeFieldLabel.toLowerCase()} value`}
                      placeholderTextColor={theme.colors.textMuted}
                    />
                    <Text style={styles.selectorHelper}>Suggested values:</Text>
                    <View style={styles.categoryOptionsWrap}>
                      {sizeValueOptions.map((value) => (
                        <Pressable
                          key={value}
                          onPress={() => {
                            if (editingDisabled) return;
                            setSizeValue(value);
                            setLegacySize(null);
                          }}
                          disabled={editingDisabled}
                          style={[styles.chip, sizeValue === value && styles.chipActive, editingDisabled && styles.buttonDisabled]}
                        >
                          <Text style={[styles.chipText, sizeValue === value && styles.chipTextActive]}>
                            {value}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : (
                  <Text style={styles.selectorHelper}>Select a size system first.</Text>
                )}
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="Category">
                <Text style={styles.categorySummary}>
                  {selectedCategoryOption
                    ? `${selectedCategoryOption.groupLabel} / ${selectedCategoryOption.label}`
                    : "Choose a supported category"}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                  {CATEGORY_GROUPS.filter((group) => group.key !== "unsupported").map((group) => (
                    <Pressable
                      key={group.key}
                      onPress={() => {
                        if (editingDisabled) return;
                        if (selectedCategoryOption?.group !== group.key) {
                          setCategory(group.options[0]?.key ?? "");
                        }
                      }}
                      disabled={editingDisabled}
                      style={[styles.chip, visibleCategoryGroup === group.key && styles.chipActive, editingDisabled && styles.buttonDisabled]}
                    >
                      <Text style={[styles.chipText, visibleCategoryGroup === group.key && styles.chipTextActive]}>
                        {group.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.categoryOptionsWrap}>
                  {visibleCategoryOptions.map((option) => (
                    <Pressable
                      key={option.key}
                      onPress={() => {
                        if (editingDisabled) return;
                        setCategory(option.key);
                      }}
                      disabled={editingDisabled}
                      style={[styles.chip, category === option.key && styles.chipActive, editingDisabled && styles.buttonDisabled]}
                    >
                      <Text style={[styles.chipText, category === option.key && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>
            </View>
          </View>

          <Field label="Condition">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {CONDITIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    if (editingDisabled) return;
                    setCondition(item);
                  }}
                  disabled={editingDisabled}
                  style={[styles.chip, condition === item && styles.chipActive, editingDisabled && styles.buttonDisabled]}
                >
                  <Text style={[styles.chipText, condition === item && styles.chipTextActive]}>
                    {item.replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Field>

          <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
              <Field label="Color">
                <TraitPickerField
                  traitKey="color"
                  label="Color"
                  value={traits.color ?? ""}
                  options={getSelectableTraitOptions("color")}
                  placeholder="Choose a color"
                  disabled={editingDisabled}
                  onChange={(value) => setTraits((prev) => ({ ...prev, color: value }))}
                />
              </Field>
            </View>
            <View style={styles.twoColItem}>
              <Field label="Country Of Origin">
                <TraitPickerField
                  traitKey="country_of_origin"
                  label="Country Of Origin"
                  value={traits.country_of_origin ?? ""}
                  options={getSelectableTraitOptions("country_of_origin")}
                  placeholder="Choose country of origin"
                  searchable
                  searchPlaceholder="Search country of origin"
                  disabled={editingDisabled}
                  onChange={(value) => setTraits((prev) => ({ ...prev, country_of_origin: value }))}
                />
              </Field>
            </View>
          </View>

          <Field label="Accept Offers">
            <Pressable
              onPress={() => {
                if (editingDisabled) return;
                setAcceptOffers((current) => !current);
              }}
              disabled={editingDisabled}
              style={[styles.toggleRow, acceptOffers && styles.toggleRowActive, editingDisabled && styles.buttonDisabled]}
            >
              <Text style={[styles.toggleLabel, acceptOffers && styles.toggleLabelActive]}>
                {acceptOffers ? "Offers accepted" : "Offers disabled"}
              </Text>
              <View style={[styles.toggleTrack, acceptOffers && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, acceptOffers && styles.toggleThumbActive]} />
              </View>
            </Pressable>
          </Field>

          <Field label="Description">
            <TextInput
              style={[styles.input, styles.textArea, editingDisabled && styles.inputDisabled]}
              value={description}
              onChangeText={setDescription}
              editable={!editingDisabled}
              multiline
              numberOfLines={5}
              placeholderTextColor={theme.colors.textMuted}
            />
          </Field>

          <Pressable
            onPress={() => {
              if (editingDisabled) return;
              setShowAdvanced((prev) => !prev);
            }}
            disabled={editingDisabled}
            style={[styles.advancedToggle, editingDisabled && styles.buttonDisabled]}
          >
            <Text style={styles.advancedToggleText}>{showAdvanced ? "Hide" : "Show"} advanced fields</Text>
          </Pressable>

          {showAdvanced && (
            <View style={styles.advancedWrap}>
              {editableTraitKeys.length === 0 ? (
                <Text style={styles.selectorHelper}>No additional advanced fields yet.</Text>
              ) : null}
              {editableTraitKeys.map((key) => (
                <Field key={key} label={getTraitLabel(key)}>
                  {isSelectableTraitKey(key) ? (
                    <TraitPickerField
                      traitKey={key}
                      label={getTraitLabel(key)}
                      value={traits[key] ?? ""}
                      options={getSelectableTraitOptions(key)}
                      placeholder={key === "color" ? "Choose a color" : "Choose country of origin"}
                      searchable={key === "country_of_origin"}
                      searchPlaceholder={key === "country_of_origin" ? "Search country of origin" : undefined}
                      disabled={editingDisabled}
                      onChange={(value) => setTraits((prev) => ({ ...prev, [key]: value }))}
                    />
                  ) : (
                    <TextInput
                      style={[styles.input, editingDisabled && styles.inputDisabled]}
                      value={traits[key] ?? ""}
                      onChangeText={(text) => setTraits((prev) => ({ ...prev, [key]: text }))}
                      editable={!editingDisabled}
                      placeholderTextColor={theme.colors.textMuted}
                    />
                  )}
                </Field>
              ))}
            </View>
          )}
        </View>

        <EbayMetadataEditor
          visible={showEbayMetadata}
          metadata={ebayMetadata}
          saving={savingEbayMetadata}
          onChange={setEbayMetadata}
          onSave={handleSaveEbayMetadata}
        />

        <View style={styles.card}>
          <View style={styles.publishHeader}>
            <Text style={styles.sectionTitle}>Marketplace Publish</Text>
            <Pressable onPress={handleSync} disabled={syncing}>
              <Text style={styles.syncBtn}>{syncing ? "Syncing..." : "Refresh"}</Text>
            </Pressable>
          </View>

          {lastSynced && <Text style={styles.syncTime}>Last synced {new Date(lastSynced).toLocaleTimeString()}</Text>}

          {publishFeedback ? (
            <View style={styles.errorBanner} testID="publish-feedback-banner">
              <Text style={styles.errorBannerText}>{publishFeedback}</Text>
            </View>
          ) : null}

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
                publishLabel={getPublishLabel(platformListing)}
              />
            ))}
          </View>

          {connectedNotLive.length > 1 && (
            <Pressable style={styles.publishAllBtn} onPress={handlePublishAll} disabled={publishingAll}>
              {publishingAll ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.publishAllText}>
                  {publishMode === "draft" ? "Save drafts to all connected" : "Publish to all connected"}
                </Text>
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

      <View style={styles.bottomSaveBar}>
        <Pressable
          style={[styles.bottomSaveBtn, (saving || editingDisabled) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || editingDisabled}
        >
          {saving ? <ActivityIndicator size="small" color={theme.colors.white} /> : <Text style={styles.bottomSaveText}>Save Listing</Text>}
        </Pressable>
      </View>
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
  buttonDisabled: {
    opacity: 0.5,
  },
  scroll: {
    paddingBottom: 120,
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
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: 4,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  statusBanner: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusBannerText: {
    flex: 1,
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  errorBanner: {
    marginTop: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBannerText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  verificationBadge: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  verificationBadgeText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    padding: 14,
    gap: 12,
    ...theme.shadow.raised,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.sansBold,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  input: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  inputDisabled: {
    opacity: 0.6,
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
  categorySummary: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 13,
  },
  selectorHelper: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  categoryOptionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
  },
  chipText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  chipTextActive: {
    color: theme.colors.white,
  },
  advancedToggle: {
    borderRadius: theme.radius.sm,
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surfaceStrong,
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
  toggleRow: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleRowActive: {
    backgroundColor: theme.colors.accentSoft,
  },
  toggleLabel: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  toggleLabelActive: {
    color: theme.colors.accent,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    padding: 3,
    justifyContent: "center",
  },
  toggleTrackActive: {
    backgroundColor: theme.colors.accent,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: theme.colors.white,
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
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
    color: theme.colors.accent,
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
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    paddingVertical: 12,
    ...theme.shadow.raised,
    shadowColor: "#6C63FF",
  },
  publishAllText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  delistAllBtn: {
    marginTop: 2,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceStrong,
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
    backgroundColor: theme.colors.surfaceStrong,
    alignItems: "center",
    paddingVertical: 13,
  },
  deleteText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  bottomSaveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  bottomSaveBtn: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    minHeight: 52,
    ...theme.shadow.raised,
    shadowColor: "#6C63FF",
  },
  bottomSaveText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
});
