import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { getListings, bulkPublish } from "@/lib/api";
import type { Listing, Platform } from "@/lib/types";
import { getPublishMode, type PublishMode } from "@/lib/publish-mode";
import { getDisplayStatus } from "@/lib/types";
import ListingCard from "@/components/ListingCard";
import { theme, PLATFORM_CODES } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import { useFadeSlideIn, usePressScale } from "@/lib/motion";

type FilterTab = "all" | "draft" | "live" | "sold";

const FILTER_TABS: FilterTab[] = ["all", "draft", "live", "sold"];
const PUBLISH_POLL_INTERVAL_MS = 3_000;
const PUBLISH_POLL_TIMEOUT_MS = 120_000;

export default function DashboardScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlatforms, setBulkPlatforms] = useState<Set<Platform>>(new Set(["grailed", "depop"]));
  const [publishing, setPublishing] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>("live");
  const listingsRef = useRef<Listing[]>([]);
  const publishPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const publishPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishPollInFlightRef = useRef(false);
  const headerMotion = useFadeSlideIn({ delay: 0, y: -6, duration: 180 });
  const tabsMotion = useFadeSlideIn({ delay: 60, y: -6, duration: 180 });
  const capturePress = usePressScale({ pressedScale: 0.97 });

  const loadListings = useCallback(async () => {
    try {
      const data = await getListings();
      listingsRef.current = data;
      setListings(data);
      return data;
    } catch (err) {
      console.error(err);
      showToast("Failed to load listings. Pull to retry.");
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  const clearPublishPolling = useCallback(() => {
    if (publishPollIntervalRef.current) {
      clearInterval(publishPollIntervalRef.current);
      publishPollIntervalRef.current = null;
    }
    if (publishPollTimeoutRef.current) {
      clearTimeout(publishPollTimeoutRef.current);
      publishPollTimeoutRef.current = null;
    }
    publishPollInFlightRef.current = false;
  }, []);

  const stopPublishPolling = useCallback(() => {
    clearPublishPolling();
    setPublishing(false);
  }, [clearPublishPolling]);

  const hasPublishingListings = useCallback((items: Listing[]) => {
    return items.some((listing) =>
      (listing.platform_listings ?? []).some((platformListing) => platformListing.status === "publishing")
    );
  }, []);

  const startPublishPolling = useCallback(async () => {
    clearPublishPolling();

    const pollOnce = async () => {
      if (publishPollInFlightRef.current) return true;
      publishPollInFlightRef.current = true;

      try {
        const data = await loadListings();
        if (!data) return true;
        if (!hasPublishingListings(listingsRef.current)) {
          stopPublishPolling();
          return false;
        }
        return true;
      } finally {
        publishPollInFlightRef.current = false;
      }
    };

    publishPollIntervalRef.current = setInterval(() => {
      void pollOnce();
    }, PUBLISH_POLL_INTERVAL_MS);

    publishPollTimeoutRef.current = setTimeout(() => {
      stopPublishPolling();
    }, PUBLISH_POLL_TIMEOUT_MS);
  }, [clearPublishPolling, hasPublishingListings, loadListings, stopPublishPolling]);

  useEffect(() => {
    return () => {
      clearPublishPolling();
    };
  }, [clearPublishPolling]);

  const loadPublishMode = useCallback(async () => {
    try {
      setPublishMode(await getPublishMode());
    } catch (err) {
      console.error(err);
      showToast("Failed to load publish preference.");
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      loadListings();
      loadPublishMode();
    }, [loadListings, loadPublishMode])
  );

  const counts = useMemo(() => {
    const status = listings.map((l) => getDisplayStatus(l));
    return {
      all: listings.length,
      draft: status.filter((s) => s === "draft").length,
      live: status.filter((s) => s === "live" || s === "partially_live").length,
      sold: status.filter((s) => s === "sold").length,
    };
  }, [listings]);

  const listedValue = useMemo(() => {
    return listings.reduce((sum, l) => {
      const status = getDisplayStatus(l);
      if (status !== "live" && status !== "partially_live") return sum;
      const price = Number(l.price);
      return Number.isNaN(price) ? sum : sum + price;
    }, 0);
  }, [listings]);

  const filtered = listings.filter((l) => {
    if (filter === "all") return true;
    const status = getDisplayStatus(l);
    if (filter === "draft") return status === "draft";
    if (filter === "live") return status === "live" || status === "partially_live";
    if (filter === "sold") return status === "sold";
    return true;
  });

  const drafts = listings.filter((l) => getDisplayStatus(l) === "draft");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlatform(platform: Platform) {
    setBulkPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function handleBulkPublish() {
    if (selected.size === 0 || bulkPlatforms.size === 0) return;
    setPublishing(true);
    try {
      const response = await bulkPublish(Array.from(selected), Array.from(bulkPlatforms), publishMode);
      if (!response.acknowledged) {
        setPublishing(false);
        return;
      }

      setSelectMode(false);
      setSelected(new Set());

      await startPublishPolling();
    } catch (err) {
      console.error(err);
      showToast("Bulk publish failed. Try again.");
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.ink} />
        <Text style={styles.loadingText}>PRINTING MANIFEST…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={headerMotion}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>
            VIBE<Text style={styles.wordmarkAccent}>LYSTER</Text>
          </Text>
          <Text style={styles.headerMeta}>THE MANIFEST</Text>
        </View>
      </Animated.View>

      <Animated.View style={tabsMotion}>
        <View style={styles.tabs}>
          {FILTER_TABS.map((tab) => (
            <Pressable key={tab} onPress={() => setFilter(tab)} style={[styles.tab, filter === tab && styles.activeTab]}>
              <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>
                {tab.toUpperCase()} {counts[tab]}
              </Text>
            </Pressable>
          ))}

          {!selectMode && drafts.length > 0 && (
            <Pressable style={styles.selectBtn} onPress={() => setSelectMode(true)}>
              <Text style={styles.selectBtnText}>SELECT</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      {selectMode && (
        <View style={styles.bulkWrap}>
          <View style={styles.selectionBar}>
            <Pressable
              onPress={() => {
                setSelectMode(false);
                setSelected(new Set());
              }}
            >
              <Text style={styles.cancelText}>CANCEL</Text>
            </Pressable>
            <Text style={styles.selectedCount}>{selected.size} SELECTED</Text>
            <Pressable
              style={[
                styles.selectionPublishBtn,
                (publishing || selected.size === 0 || bulkPlatforms.size === 0) && styles.publishBtnDisabled,
              ]}
              onPress={handleBulkPublish}
              disabled={publishing || selected.size === 0 || bulkPlatforms.size === 0}
            >
              {publishing ? (
                <ActivityIndicator size="small" color={theme.colors.white} />
              ) : (
                <Text style={styles.selectionPublishText}>
                  {publishMode === "draft" ? "SAVE DRAFTS" : "PRINT LISTINGS"}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.platformToggleBar}>
            {(["grailed", "depop"] as Platform[]).map((platform) => (
              <Pressable
                key={platform}
                onPress={() => togglePlatform(platform)}
                style={[styles.platformToggle, bulkPlatforms.has(platform) && styles.platformToggleActive]}
              >
                <Text
                  style={[
                    styles.platformToggleText,
                    bulkPlatforms.has(platform) && styles.platformToggleTextActive,
                  ]}
                >
                  {PLATFORM_CODES[platform] ?? platform.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const isDraft = getDisplayStatus(item) === "draft";
          return (
            <ListingCard
              listing={item}
              entranceIndex={index}
              selectable={selectMode && isDraft}
              selected={selected.has(item.id)}
              onPress={() => {
                if (selectMode) {
                  if (isDraft) toggleSelect(item.id);
                  return;
                }
                router.push(`/listing/${item.id}`);
              }}
              onLongPress={() => {
                if (!isDraft) return;
                if (!selectMode) setSelectMode(true);
                toggleSelect(item.id);
              }}
            />
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadListings();
            }}
            tintColor={theme.colors.ink}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing in the pile.</Text>
            <Text style={styles.emptySub}>POINT THE CAMERA AT SOMETHING GOOD</Text>
          </View>
        }
      />

      {!selectMode && (
        <View style={styles.footer}>
          <View style={styles.subtotal}>
            <Text style={styles.subtotalText}>
              {counts.all} {counts.all === 1 ? "ITEM" : "ITEMS"} / {counts.live} LIVE
            </Text>
            <Text style={styles.subtotalText}>${listedValue.toFixed(0)} LISTED</Text>
          </View>
          <Animated.View style={capturePress.animatedStyle}>
            <Pressable
              style={styles.captureBtn}
              onPress={() => router.push("/capture")}
              onPressIn={capturePress.onPressIn}
              onPressOut={capturePress.onPressOut}
            >
              <Text style={styles.captureBtnText}>◉ CAPTURE</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
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
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  loadingText: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: theme.colors.textMuted,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1.5,
    borderBottomColor: theme.colors.ink,
  },
  wordmark: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 16,
    letterSpacing: 1,
  },
  wordmarkAccent: {
    color: theme.colors.accent,
  },
  headerMeta: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: theme.colors.textMuted,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  activeTab: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    fontFamily: theme.fonts.monoBold,
  },
  activeTabText: {
    color: theme.colors.bg,
  },
  selectBtn: {
    marginLeft: "auto",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.ballpoint,
    paddingVertical: 5,
  },
  selectBtnText: {
    color: theme.colors.ballpoint,
    fontFamily: theme.fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  bulkWrap: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.ink,
    backgroundColor: theme.colors.surface,
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  selectedCount: {
    color: theme.colors.text,
    fontFamily: theme.fonts.monoBold,
    fontSize: 11,
  },
  selectionPublishBtn: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  selectionPublishText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.display,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  publishBtnDisabled: {
    opacity: 0.45,
  },
  platformToggleBar: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  platformToggle: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  platformToggleActive: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
  },
  platformToggleText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    fontFamily: theme.fonts.monoBold,
  },
  platformToggleTextActive: {
    color: theme.colors.bg,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  empty: {
    marginTop: 64,
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.serif,
    fontSize: 28,
    textAlign: "center",
  },
  emptySub: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  footer: {
    borderTopWidth: 1.5,
    borderTopColor: theme.colors.ink,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  subtotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: theme.spacing.sm,
  },
  subtotalText: {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    color: theme.colors.text,
  },
  captureBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.md,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: theme.colors.ink,
  },
  captureBtnText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.display,
    fontSize: 14,
    letterSpacing: 2,
  },
});
