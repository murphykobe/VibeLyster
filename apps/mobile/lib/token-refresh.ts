import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform as RNPlatform, StyleSheet, View } from "react-native";
import WebView from "react-native-webview";
import { getConnections, saveConnection } from "@/lib/api";
import type { MarketplaceConnection, Platform } from "@/lib/types";

type RefreshablePlatform = Extract<Platform, "grailed" | "depop">;
type CookieMap = Record<string, { value?: string }>;
type RefreshTarget = {
  platform: RefreshablePlatform;
  platformUsername?: string | null;
};

const MOBILE_SAFARI_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const REFRESH_THROTTLE_MS = 60 * 60 * 1000;
const REFRESHABLE_PLATFORMS: RefreshablePlatform[] = ["grailed", "depop"];

const WEBVIEW_SOURCE: Record<RefreshablePlatform, { uri: string; userAgent?: string }> = {
  grailed: {
    uri: "https://www.grailed.com/",
    userAgent: MOBILE_SAFARI_USER_AGENT,
  },
  depop: {
    uri: "https://www.depop.com/",
  },
};

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRefreshablePlatform(platform: Platform): platform is RefreshablePlatform {
  return REFRESHABLE_PLATFORMS.includes(platform as RefreshablePlatform);
}

async function getGrailedCookieMap(): Promise<CookieMap> {
  const { default: CookieManager } = await import("@react-native-cookies/cookies");
  const [cookieMapWww, cookieMapRoot, cookieMapWwwLegacy, cookieMapRootLegacy] = await Promise.all([
    CookieManager.get("https://www.grailed.com", true).catch(() => ({})),
    CookieManager.get("https://grailed.com", true).catch(() => ({})),
    CookieManager.get("https://www.grailed.com").catch(() => ({})),
    CookieManager.get("https://grailed.com").catch(() => ({})),
  ]);

  return {
    ...cookieMapRootLegacy,
    ...cookieMapWwwLegacy,
    ...cookieMapRoot,
    ...cookieMapWww,
  } as CookieMap;
}

async function getDepopCookieMap(): Promise<CookieMap> {
  const { default: CookieManager } = await import("@react-native-cookies/cookies");
  const [cookieMapWww, cookieMapRoot, cookieMapWwwLegacy, cookieMapRootLegacy] = await Promise.all([
    CookieManager.get("https://www.depop.com", true).catch(() => ({})),
    CookieManager.get("https://depop.com", true).catch(() => ({})),
    CookieManager.get("https://www.depop.com").catch(() => ({})),
    CookieManager.get("https://depop.com").catch(() => ({})),
  ]);

  return {
    ...cookieMapRootLegacy,
    ...cookieMapWwwLegacy,
    ...cookieMapRoot,
    ...cookieMapWww,
  } as CookieMap;
}

async function refreshGrailedConnection(target: RefreshTarget) {
  const cookieMap = await getGrailedCookieMap();
  const csrfToken = pickString(cookieMap["csrf_token"]?.value);
  const grailedJwt = pickString(cookieMap["grailed_jwt"]?.value);
  if (!csrfToken || !grailedJwt) return;

  const cookieString = Object.entries(cookieMap)
    .map(([name, cookie]) => `${name}=${cookie.value}`)
    .join("; ");

  await saveConnection({
    platform: "grailed",
    tokens: { csrf_token: csrfToken, cookies: cookieString },
    platformUsername: target.platformUsername ?? undefined,
  });
}

async function refreshDepopConnection(target: RefreshTarget) {
  const cookieMap = await getDepopCookieMap();
  const accessToken =
    pickString(cookieMap["access_token"]?.value) ??
    pickString(cookieMap["depop_access_token"]?.value);
  if (!accessToken) return;

  await saveConnection({
    platform: "depop",
    tokens: { access_token: accessToken },
    platformUsername: target.platformUsername ?? undefined,
  });
}

function getRefreshTargets(connections: MarketplaceConnection[]): RefreshTarget[] {
  const targets = new Map<RefreshablePlatform, RefreshTarget>();

  for (const connection of connections) {
    if (!isRefreshablePlatform(connection.platform)) continue;

    const platform = connection.platform;
    targets.set(platform, {
      platform,
      platformUsername: connection.platform_username,
    });
  }

  return REFRESHABLE_PLATFORMS.filter((platform) => targets.has(platform)).map((platform) => targets.get(platform)!);
}

export function BackgroundTokenRefresh() {
  const [activeTargets, setActiveTargets] = useState<RefreshTarget[]>([]);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inFlightPlatformsRef = useRef<Set<RefreshablePlatform>>(new Set());
  const isRefreshingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const finishPlatformRefresh = useCallback((platform: RefreshablePlatform) => {
    setActiveTargets((currentTargets) => {
      const nextTargets = currentTargets.filter((target) => target.platform !== platform);
      if (nextTargets.length === 0) {
        isRefreshingRef.current = false;
      }
      return nextTargets;
    });
  }, []);

  const refreshPlatform = useCallback(async (target: RefreshTarget) => {
    if (target.platform === "grailed") {
      await refreshGrailedConnection(target);
      return;
    }

    await refreshDepopConnection(target);
  }, []);

  const runRefresh = useCallback(async () => {
    if (RNPlatform.OS === "web" || isRefreshingRef.current) return;

    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) return;

    lastRefreshAtRef.current = now;
    isRefreshingRef.current = true;

    try {
      const connections = await getConnections();
      const nextTargets = getRefreshTargets(connections);
      if (nextTargets.length === 0) {
        isRefreshingRef.current = false;
        return;
      }

      setRefreshCycle((value) => value + 1);
      setActiveTargets(nextTargets);
    } catch {
      isRefreshingRef.current = false;
    }
  }, []);

  const handleLoadEnd = useCallback((target: RefreshTarget) => {
    if (inFlightPlatformsRef.current.has(target.platform)) return;
    inFlightPlatformsRef.current.add(target.platform);

    void (async () => {
      try {
        await refreshPlatform(target);
      } catch {
        // Silent by design.
      } finally {
        inFlightPlatformsRef.current.delete(target.platform);
        finishPlatformRefresh(target.platform);
      }
    })();
  }, [finishPlatformRefresh, refreshPlatform]);

  useEffect(() => {
    if (RNPlatform.OS === "web") return;

    void runRefresh();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if ((previousAppState === "inactive" || previousAppState === "background") && nextAppState === "active") {
        void runRefresh();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [runRefresh]);

  if (RNPlatform.OS === "web" || activeTargets.length === 0) {
    return null;
  }

  return createElement(
    View,
    { pointerEvents: "none", style: styles.container },
    activeTargets.map((target) => {
      const source = WEBVIEW_SOURCE[target.platform];
      return createElement(WebView, {
        key: `${target.platform}-${refreshCycle}`,
        source: { uri: source.uri },
        style: styles.webview,
        originWhitelist: ["http://*", "https://*", "about:*"],
        userAgent: source.userAgent,
        onLoadEnd: () => handleLoadEnd(target),
        sharedCookiesEnabled: true,
        javaScriptEnabled: true,
      });
    })
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: -10000,
    left: -10000,
    width: 0,
    height: 0,
    opacity: 0,
  },
  webview: {
    width: 0,
    height: 0,
  },
});
