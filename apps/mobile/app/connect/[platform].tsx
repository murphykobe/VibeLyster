/**
 * WebView-based marketplace authentication screen.
 *
 * Grailed: user logs in manually in the WebView, then taps a button to check native cookies.
 * Depop: captures access_token either from redirect URL params or native cookie store.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform as RNPlatform, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import { saveConnection } from "@/lib/api";
import type { Platform } from "@/lib/types";
import { theme } from "@/lib/theme";

const MOBILE_SAFARI_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const CONFIG: Record<Platform, { url: string; title: string }> = {
  grailed: {
    url: "https://www.grailed.com/",
    title: "Connect Grailed",
  },
  depop: {
    url: "https://www.depop.com/login/",
    title: "Connect Depop",
  },
  ebay: {
    url: "https://signin.ebay.com/",
    title: "Connect eBay",
  },
};

type DebugEvent = {
  id: number;
  message: string;
};

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function summarizeCookieMap(cookieMap: Record<string, { value?: string }>) {
  return Object.entries(cookieMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, cookie]) => `${name}:${cookie.value?.length ?? 0}`)
    .join(", ");
}

type GrailedJwtPayload = {
  sub?: number | string;
  jti?: string;
  iss?: string;
  act?: string;
  iat?: number;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  if (typeof atob === "function") {
    return atob(padded);
  }
  return globalThis.Buffer ? globalThis.Buffer.from(padded, "base64").toString("utf8") : "";
}

function parseGrailedJwt(token?: string | null): GrailedJwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as GrailedJwtPayload;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function extractAccessTokenFromUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    const fromSearch = pickString(url.searchParams.get("access_token"));
    if (fromSearch) return fromSearch;

    const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
    const fromHash = pickString(hashParams.get("access_token"));
    if (fromHash) return fromHash;
  } catch {
    // Fallback to regex below.
  }

  const match = trimmed.match(/[?#&]access_token=([^&#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getGrailedAuthPayload(cookieMap: Record<string, { value?: string }>) {
  const csrfToken = pickString(cookieMap["csrf_token"]?.value);
  const grailedJwt = pickString(cookieMap["grailed_jwt"]?.value);
  const grailedJwtPayload = parseGrailedJwt(grailedJwt);
  const grailedUserId = grailedJwtPayload?.sub != null ? String(grailedJwtPayload.sub) : undefined;
  const isGrailedAuthJwt = Boolean(
    csrfToken &&
    grailedJwt &&
    grailedJwtPayload &&
    grailedJwtPayload.iss === "Grailed-production" &&
    grailedJwtPayload.act === "auth" &&
    grailedUserId
  );

  return {
    csrfToken,
    grailedJwt,
    grailedJwtPayload,
    grailedUserId,
    isGrailedAuthJwt,
  };
}

export default function ConnectScreen() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  const router = useRouter();
  const webviewRef = useRef<WebView>(null);
  const saveAttemptedRef = useRef(false);
  const debugIdRef = useRef(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [overrideUrl, setOverrideUrl] = useState<string | null>(null);
  const [depopMagicLink, setDepopMagicLink] = useState("");

  const config = CONFIG[platform as Platform];
  const typedPlatform = platform as Platform;
  const showDebug = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  const sourceUri = overrideUrl ?? config?.url ?? "";

  const pushDebug = useCallback((message: string) => {
    console.log(`[connect:${platform ?? "unknown"}] ${message}`);
    setDebugEvents((events) => [
      { id: debugIdRef.current++, message },
      ...events,
    ].slice(0, 8));
  }, [platform]);

  const debugSummary = useMemo(() => {
    if (!showDebug) return null;
    return debugEvents.map((event) => event.message).join("\n");
  }, [debugEvents, showDebug]);

  if (!config) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Unknown platform: {platform}</Text>
      </View>
    );
  }

  async function saveGrailedConnection(platformUsername?: string) {
    if (saveAttemptedRef.current) return;
    saveAttemptedRef.current = true;
    setSaving(true);

    try {
      if (RNPlatform.OS === "web") {
        Alert.alert("Not supported on web", "Use this flow on iOS/Android, or use mock connect on web.");
        return;
      }

      const { default: CookieManager } = await import("@react-native-cookies/cookies");
      const [cookieMapWww, cookieMapRoot, cookieMapWwwLegacy, cookieMapRootLegacy] = await Promise.all([
        CookieManager.get("https://www.grailed.com", true).catch(() => ({})),
        CookieManager.get("https://grailed.com", true).catch(() => ({})),
        CookieManager.get("https://www.grailed.com").catch(() => ({})),
        CookieManager.get("https://grailed.com").catch(() => ({})),
      ]);
      const cookieMap = {
        ...cookieMapRootLegacy,
        ...cookieMapWwwLegacy,
        ...cookieMapRoot,
        ...cookieMapWww,
      } as Record<string, { value?: string }>;
      pushDebug(`Grailed cookies: ${summarizeCookieMap(cookieMap) || "(none)"}`);

      const csrfToken = pickString(cookieMap["csrf_token"]?.value);
      const grailedJwt = pickString(cookieMap["grailed_jwt"]?.value);
      const grailedUserId = getGrailedAuthPayload(cookieMap).grailedUserId;
      if (!csrfToken || !grailedJwt) {
        saveAttemptedRef.current = false;
        Alert.alert(
          "Login not detected",
          "Missing required Grailed auth cookies (csrf_token and/or grailed_jwt). Complete login and try again."
        );
        return;
      }

      pushDebug(`Grailed jwt detected userId=${grailedUserId ?? "unknown"}`);

      const cookieString = Object.entries(cookieMap)
        .map(([name, cookie]) => `${name}=${cookie.value}`)
        .join("; ");

      await saveConnection({
        platform: "grailed",
        tokens: { csrf_token: csrfToken, cookies: cookieString },
        platformUsername,
      });

      pushDebug(`Grailed saveConnection ok${platformUsername ? ` (${platformUsername})` : ""}`);
      Alert.alert("Connected!", "Grailed account connected successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      saveAttemptedRef.current = false;
      const message = err instanceof Error ? err.message : "Failed to save connection. Try again.";
      pushDebug(`Grailed save failed: ${message}`);
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDepopConnection(accessToken: string) {
    if (saveAttemptedRef.current) return;
    saveAttemptedRef.current = true;
    setSaving(true);

    try {
      await saveConnection({
        platform: "depop",
        tokens: { access_token: accessToken },
      });
      pushDebug(`Depop saveConnection ok (token len ${accessToken.length})`);
      Alert.alert("Connected!", "Depop account connected successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      saveAttemptedRef.current = false;
      const message = err instanceof Error ? err.message : "Failed to save connection. Try again.";
      pushDebug(`Depop save failed: ${message}`);
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  }

  async function tryCaptureDepopTokenFromCookies(reason: string) {
    if (typedPlatform !== "depop" || saveAttemptedRef.current) return;
    if (RNPlatform.OS === "web") return;

    try {
      const { default: CookieManager } = await import("@react-native-cookies/cookies");
      const [cookieMapWww, cookieMapRoot, cookieMapWwwLegacy, cookieMapRootLegacy] = await Promise.all([
        CookieManager.get("https://www.depop.com", true).catch(() => ({})),
        CookieManager.get("https://depop.com", true).catch(() => ({})),
        CookieManager.get("https://www.depop.com").catch(() => ({})),
        CookieManager.get("https://depop.com").catch(() => ({})),
      ]);
      const cookieMap = {
        ...cookieMapRootLegacy,
        ...cookieMapWwwLegacy,
        ...cookieMapRoot,
        ...cookieMapWww,
      } as Record<string, { value?: string }>;
      pushDebug(`Depop cookies (${reason}): ${summarizeCookieMap(cookieMap) || "(none)"}`);

      const accessToken =
        pickString(cookieMap["access_token"]?.value) ??
        pickString(cookieMap["depop_access_token"]?.value);

      if (!accessToken) return;
      pushDebug(`Depop token found in cookies (${reason})`);
      await saveDepopConnection(accessToken);
    } catch (err) {
      pushDebug(`Depop cookie check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleMessage(_event: WebViewMessageEvent) {
    // No-op for now. Detection is handled via navigation + native cookie reads.
  }

  async function handleDepopMagicLinkSubmit() {
    const trimmed = depopMagicLink.trim();
    if (!trimmed) return;

    const accessToken = extractAccessTokenFromUrl(trimmed);
    if (accessToken) {
      pushDebug(`Depop token found in pasted link (len ${accessToken.length})`);
      await saveDepopConnection(accessToken);
      return;
    }

    pushDebug("Loading pasted Depop magic link in WebView");
    setOverrideUrl(trimmed);
    setCurrentUrl(trimmed);
  }

  async function tryCaptureGrailedConnection(reason: string) {
    if (typedPlatform !== "grailed" || saveAttemptedRef.current) return;
    if (RNPlatform.OS === "web") return;

    try {
      const { default: CookieManager } = await import("@react-native-cookies/cookies");
      const [cookieMapWww, cookieMapRoot, cookieMapWwwLegacy, cookieMapRootLegacy] = await Promise.all([
        CookieManager.get("https://www.grailed.com", true).catch(() => ({})),
        CookieManager.get("https://grailed.com", true).catch(() => ({})),
        CookieManager.get("https://www.grailed.com").catch(() => ({})),
        CookieManager.get("https://grailed.com").catch(() => ({})),
      ]);
      const cookieMap = {
        ...cookieMapRootLegacy,
        ...cookieMapWwwLegacy,
        ...cookieMapRoot,
        ...cookieMapWww,
      } as Record<string, { value?: string }>;
      pushDebug(`Grailed cookies (${reason}): ${summarizeCookieMap(cookieMap) || "(none)"}`);

      const grailedJwt = pickString(cookieMap["grailed_jwt"]?.value);
      const grailedUserId = getGrailedAuthPayload(cookieMap).grailedUserId;
      if (!grailedJwt) return;

      pushDebug(`Grailed jwt detected (${reason}) userId=${grailedUserId ?? "unknown"}`);
      await saveGrailedConnection();
    } catch (err) {
      pushDebug(`Grailed cookie check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleOpenWindow(event: { nativeEvent: { targetUrl: string } }) {
    const targetUrl = pickString(event.nativeEvent.targetUrl);
    pushDebug(`Open window: ${targetUrl ?? "(none)"}`);
    if (!targetUrl || targetUrl.startsWith("about:")) return;
    webviewRef.current?.stopLoading();
    setCurrentUrl(targetUrl);
    webviewRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(targetUrl)}; true;`);
  }

  function handleShouldStartLoad(request: { url: string }) {
    pushDebug(`Should load: ${request.url}`);
    return true;
  }

  async function handleNavigationChange(nav: WebViewNavigation) {
    const url = nav.url;
    setCurrentUrl(url);
    pushDebug(`Nav: ${url}`);

    if (typedPlatform === "grailed") {
      await tryCaptureGrailedConnection("navigation");
      return;
    }

    if (typedPlatform !== "depop") return;

    const tokenMatch = url.match(/[?&]access_token=([^&#]+)/i);
    if (tokenMatch?.[1]) {
      const accessToken = decodeURIComponent(tokenMatch[1]);
      pushDebug(`Depop token found in URL (len ${accessToken.length})`);
      await saveDepopConnection(accessToken);
      return;
    }

    await tryCaptureDepopTokenFromCookies("navigation");
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Close</Text>
        </Pressable>
        <Text style={styles.title}>{config.title}</Text>
        {showDebug ? (
          <Pressable onPress={() => setDebugExpanded((value) => !value)} style={styles.debugToggleBtn}>
            <Text style={styles.debugToggleText}>{debugExpanded ? "Hide" : "Debug"}</Text>
          </Pressable>
        ) : (
          <View style={{ width: 52 }} />
        )}
      </View>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.white} />
          <Text style={styles.savingText}>Saving connection…</Text>
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: sourceUri }}
        style={styles.webview}
        originWhitelist={["http://*", "https://*", "about:*"]}
        userAgent={typedPlatform === "grailed" ? MOBILE_SAFARI_USER_AGENT : undefined}
        mediaPlaybackRequiresUserAction
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          pushDebug(`Load end: ${currentUrl ?? sourceUri}`);
          if (typedPlatform === "grailed") {
            void tryCaptureGrailedConnection("load-end");
          } else if (typedPlatform === "depop") {
            void tryCaptureDepopTokenFromCookies("load-end");
          }
        }}
        onMessage={handleMessage}
        onNavigationStateChange={(nav) => {
          void handleNavigationChange(nav);
        }}
        onOpenWindow={typedPlatform === "grailed" ? handleOpenWindow : undefined}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        sharedCookiesEnabled
        javaScriptEnabled
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      )}

      {typedPlatform === "depop" && (
        <View style={styles.helperPanel}>
          <Text style={styles.helperTitle}>Paste magic link</Text>
          <Text style={styles.helperText}>After Depop emails you the sign-in link, paste it here. We'll extract the token or follow the redirect for you.</Text>
          <TextInput
            style={styles.magicLinkInput}
            value={depopMagicLink}
            onChangeText={setDepopMagicLink}
            placeholder="Paste Depop email link"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <Pressable
            onPress={() => void handleDepopMagicLinkSubmit()}
            style={[styles.magicLinkButton, !depopMagicLink.trim() && styles.magicLinkButtonDisabled]}
            disabled={!depopMagicLink.trim() || saving}
          >
            <Text style={styles.magicLinkButtonText}>Use pasted link</Text>
          </Pressable>
        </View>
      )}

      {showDebug && debugExpanded && (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Debug</Text>
          <Text numberOfLines={2} style={styles.debugCurrentUrl}>
            {currentUrl ?? config.url}
          </Text>
          {debugSummary ? <Text style={styles.debugText}>{debugSummary}</Text> : null}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    minWidth: 52,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  backText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.fonts.sansBold,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontFamily: theme.fonts.sansBold,
  },
  debugToggleBtn: {
    minWidth: 52,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  debugToggleText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.fonts.sansBold,
  },
  webview: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  helperPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  helperTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 14,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 12,
    lineHeight: 18,
  },
  magicLinkInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceStrong,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    textAlignVertical: "top",
  },
  magicLinkButton: {
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  magicLinkButtonDisabled: {
    opacity: 0.55,
  },
  magicLinkButtonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 13,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(246, 241, 232, 0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  savingOverlay: {
    position: "absolute",
    top: 62,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  savingText: {
    color: theme.colors.white,
    fontSize: 15,
    fontFamily: theme.fonts.sansBold,
  },
  debugPanel: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: "rgba(28, 28, 30, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  debugTitle: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  debugCurrentUrl: {
    color: "#9DD6FF",
    fontFamily: theme.fonts.sans,
    fontSize: 12,
  },
  debugText: {
    color: "#E8E8E8",
    fontFamily: theme.fonts.sans,
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    color: theme.colors.textMuted,
    padding: 24,
    fontFamily: theme.fonts.sans,
  },
});
