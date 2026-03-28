import { useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  Text,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { getListings, bulkPublish } from "@/lib/api";
import type { Listing, Platform } from "@/lib/types";
import { getDisplayStatus } from "@/lib/types";
import ListingCard from "@/components/ListingCard";

type FilterTab = "all" | "draft" | "live" | "sold";

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

  useFocusEffect(useCallback(() => { loadListings(); }, [loadListings]));

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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function togglePlatform(platform: Platform) {
    setBulkPlatforms((prev) => {
      const next = new Set(prev);
      next.has(platform) ? next.delete(platform) : next.add(platform);
      return next;
    });
  }

  async function handleBulkPublish() {
    if (selected.size === 0 || bulkPlatforms.size === 0) return;
    setPublishing(true);
    try {
      await bulkPublish(Array.from(selected), Array.from(bulkPlatforms));
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
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.tabs}>
        {(["all", "draft", "live", "sold"] as FilterTab[]).map((tab) => (
          <Pressable key={tab} onPress={() => setFilter(tab)} style={[styles.tab, filter === tab && styles.activeTab]}>
            <Text style={[styles.tabText, filter === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
        {!selectMode && drafts.length > 0 && (
          <Pressable style={styles.selectBtn} onPress={() => setSelectMode(true)}>
            <Text style={styles.selectBtnText}>Select</Text>
          </Pressable>
        )}
        {selectMode && (
          <Pressable style={styles.selectBtn} onPress={() => { setSelectMode(false); setSelected(new Set()); }}>
            <Text style={styles.selectBtnText}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {/* Listing list */}
      <FlatList
        data={filtered}
        keyExtractor={(l) => l.id}
        renderItem={({ item }) => (
          <ListingCard
            listing={item}
            selectable={selectMode}
            selected={selected.has(item.id)}
            onPress={() => selectMode ? toggleSelect(item.id) : router.push(`/listing/${item.id}`)}
            onLongPress={() => { setSelectMode(true); toggleSelect(item.id); }}
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadListings(); }} tintColor="#fff" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No listings yet.</Text>
            <Text style={styles.emptySubtext}>Tap + to create your first listing.</Text>
          </View>
        }
      />

      {/* Bulk publish bar */}
      {selectMode && selected.size > 0 && (
        <View style={styles.bulkBar}>
          <View style={styles.platformToggles}>
            {(["grailed", "depop"] as Platform[]).map((p) => (
              <Pressable key={p} onPress={() => togglePlatform(p)} style={[styles.platformToggle, bulkPlatforms.has(p) && styles.platformToggleActive]}>
                <Text style={[styles.platformToggleText, bulkPlatforms.has(p) && styles.platformToggleTextActive]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.publishBtn, (publishing || bulkPlatforms.size === 0) && styles.publishBtnDisabled]} onPress={handleBulkPublish} disabled={publishing || bulkPlatforms.size === 0}>
            {publishing ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.publishBtnText}>
                Publish {selected.size} → {Array.from(bulkPlatforms).join(" + ")}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {/* FAB */}
      {!selectMode && (
        <Pressable style={styles.fab} onPress={() => router.push("/capture")}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8, alignItems: "center" },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: "#111" },
  activeTab: { backgroundColor: "#fff" },
  tabText: { color: "#888", fontSize: 13, fontWeight: "600" },
  activeTabText: { color: "#000" },
  selectBtn: { marginLeft: "auto" },
  selectBtnText: { color: "#888", fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { color: "#fff", fontSize: 18, fontWeight: "600", marginBottom: 8 },
  emptySubtext: { color: "#555", fontSize: 14 },
  bulkBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#111", padding: 16, borderTopWidth: 1, borderTopColor: "#222",
    gap: 12,
  },
  platformToggles: { flexDirection: "row", gap: 8 },
  platformToggle: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#333" },
  platformToggleActive: { backgroundColor: "#fff", borderColor: "#fff" },
  platformToggleText: { color: "#888", fontSize: 13, fontWeight: "600" },
  platformToggleTextActive: { color: "#000" },
  publishBtn: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { color: "#000", fontWeight: "700", fontSize: 15 },
  fab: {
    position: "absolute", bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#fff", shadowOpacity: 0.2, shadowRadius: 8, elevation: 8,
  },
  fabText: { fontSize: 28, color: "#000", fontWeight: "300", marginTop: -2 },
});
