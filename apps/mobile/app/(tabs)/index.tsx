import { useState, useCallback, useMemo } from "react";
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
import { theme } from "@/lib/theme";
import { useFadeSlideIn, usePressScale } from "@/lib/motion";

type FilterTab = "all" | "draft" | "live" | "sold";

const FILTER_TABS: FilterTab[] = ["all", "draft", "live", "sold"];

export default function DashboardScreen() {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPlatforms, setBulkPlatforms] = useState<Set<Platform>>(new Set(["grailed", "depop"]));
  const [publishing, setPublishing] = useState(false);
  const [publishMode, setPublishMode] = useState<PublishMode>("live");
  const heroMotion = useFadeSlideIn({ delay: 35, y: 8, duration: 240 });
  const metricsMotion = useFadeSlideIn({ delay: 110, y: 10, duration: 240 });
  const tabsMotion = useFadeSlideIn({ delay: 160, y: 10, duration: 240 });
  const fabPress = usePressScale({ pressedScale: 0.93, speed: 18 });

  const loadListings = useCallback(async () => {
    try {
      const data = await getListings();
      setListings(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPublishMode = useCallback(async () => {
    try {
      setPublishMode(await getPublishMode());
    } catch (err) {
      console.error(err);
    }
  }, []);

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
      await bulkPublish(Array.from(selected), Array.from(bulkPlatforms), publishMode);
      setSelectMode(false);
      setSelected(new Set());
      await loadListings();
    } catch (err) {
      console.error(err);
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Animated.View style={heroMotion}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>VibeLyster</Text>
          <Text style={styles.heroTitle}>Closet Command</Text>
          <Text style={styles.heroSub}>Draft, publish, and track listings in one flow.</Text>
        </View>
      </Animated.View>

      <Animated.View style={metricsMotion}>
        <View style={styles.metricsRow}>
          <Metric label="Drafts" value={counts.draft} />
          <Metric label="Live" value={counts.live} />
          <Metric label="Sold" value={counts.sold} />
        </View>
      </Animated.View>

      <Animated.View style={tabsMotion}>
        <View style={styles.tabs}>
          {FILTER_TABS.map((tab) => (
            <Pressable key={tab} onPress={() => setFilter(tab)} style={[styles.tab, filter === tab && styles.activeTab]}>
              <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)} {counts[tab]}
              </Text>
            </Pressable>
          ))}

          {!selectMode && drafts.length > 0 && (
            <Pressable style={styles.selectBtn} onPress={() => setSelectMode(true)}>
              <Text style={styles.selectBtnText}>Select</Text>
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
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.selectedCount}>{selected.size} selected</Text>
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
                <Text style={styles.selectionPublishText}>{publishMode === "draft" ? "Save Drafts" : "Publish"}</Text>
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
                  {platform.charAt(0).toUpperCase() + platform.slice(1)}
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
            tintColor={theme.colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No listings yet</Text>
            <Text style={styles.emptySub}>Create your first draft to get started.</Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push("/capture")}>
              <Text style={styles.emptyCtaText}>Start a Listing</Text>
            </Pressable>
          </View>
        }
      />

      {!selectMode && (
        <Animated.View style={fabPress.animatedStyle}>
          <Pressable
            style={styles.fab}
            onPress={() => router.push("/capture")}
            onPressIn={fabPress.onPressIn}
            onPressOut={fabPress.onPressOut}
          >
            <Text style={styles.fabText}>+</Text>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
  hero: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 2,
  },
  heroSub: {
    marginTop: 6,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  metricsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
  },
  metricCell: {
    flex: 1,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    alignItems: "center",
    ...theme.shadow.card,
  },
  metricValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 24,
  },
  metricLabel: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    marginTop: -2,
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    alignItems: "center",
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  activeTab: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: "#F8CBB7",
  },
  tabText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.sansBold,
  },
  activeTabText: {
    color: theme.colors.accent,
  },
  selectBtn: {
    marginLeft: "auto",
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectBtnText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  bulkWrap: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  selectedCount: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  selectionPublishBtn: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  selectionPublishText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
  },
  publishBtnDisabled: {
    opacity: 0.45,
  },
  platformToggleBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  platformToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  platformToggleActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  platformToggleText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.sansBold,
  },
  platformToggleTextActive: {
    color: theme.colors.accent,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  empty: {
    marginTop: 52,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 30,
  },
  emptySub: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
  },
  emptyCta: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyCtaText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    right: 22,
    bottom: 30,
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
    ...theme.shadow.card,
  },
  fabText: {
    color: theme.colors.white,
    fontSize: 34,
    lineHeight: 36,
    marginTop: -2,
    fontFamily: theme.fonts.sans,
  },
});
