/**
 * WebView-based marketplace authentication screen.
 *
 * Grailed: extracts csrf_token cookie + full cookie string after login
 * Depop: intercepts magic link redirect to extract Bearer access_token
 */

import { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import WebView, { WebViewNavigation } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import CookieManager from "@react-native-cookies/cookies";
import { saveConnection } from "@/lib/api";
import type { Platform } from "@/lib/types";

const CONFIG: Record<Platform, { url: string; title: string; successPath?: string }> = {
  grailed: {
    url: "https://www.grailed.com/users/sign_in",
    title: "Connect Grailed",
  },
  depop: {
    url: "https://www.depop.com/login/",
    title: "Connect Depop",
    successPath: "depop.com",
  },
  ebay: {
    url: "https://signin.ebay.com/",
    title: "Connect eBay",
  },
};

// Injected to signal a successful Grailed login (page no longer on sign_in path).
// Does NOT read cookies — cookie extraction happens natively via CookieManager.
const GRAILED_LOGIN_DETECTOR = `
(function() {
  if (window.location.hostname === 'www.grailed.com' && !window.location.pathname.includes('sign_in')) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'grailed_logged_in' }));
  }
})();
true;
`;

export default function ConnectScreen() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  const router = useRouter();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const config = CONFIG[platform as Platform];
  if (!config) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Unknown platform: {platform}</Text>
      </View>
    );
  }

  async function handleGrailedLoggedIn() {
    setSaving(true);
    try {
      // Read cookies from the native cookie store — includes HttpOnly cookies
      // that document.cookie cannot access.
      const cookieMap = await CookieManager.get("https://www.grailed.com");
      const csrfToken = cookieMap["csrf_token"]?.value;
      if (!csrfToken) {
        Alert.alert("Login not detected", "Complete the Grailed login and try again.");
        return;
      }
      // Serialize all cookies as a Cookie header string
      const cookieString = Object.entries(cookieMap)
        .map(([name, c]) => `${name}=${c.value}`)
        .join("; ");

      await saveConnection({
        platform: "grailed",
        tokens: { csrf_token: csrfToken, cookies: cookieString },
      });
      Alert.alert("Connected!", "Grailed account connected successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert("Error", "Failed to save connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "grailed_logged_in") {
        handleGrailedLoggedIn();
      }
    } catch {
      // Non-JSON messages from the page — ignore
    }
  }

  async function handleDepopNavigationChange(nav: WebViewNavigation) {
    const url = nav.url;

    // Depop magic link: intercept the redirect that contains the access token
    // Pattern: https://www.depop.com/?access_token=XXX or /auth/callback?...
    const tokenMatch = url.match(/[?&]access_token=([A-Za-z0-9._-]+)/);
    if (tokenMatch) {
      setSaving(true);
      try {
        const accessToken = tokenMatch[1];
        await saveConnection({
          platform: "depop",
          tokens: { access_token: accessToken },
        });
        Alert.alert("Connected!", "Depop account connected successfully.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch (err) {
        Alert.alert("Error", "Failed to save connection. Try again.");
      } finally {
        setSaving(false);
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>✕</Text>
        </Pressable>
        <Text style={styles.title}>{config.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.savingText}>Saving connection…</Text>
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: config.url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleMessage}
        onNavigationStateChange={platform === "depop" ? handleDepopNavigationChange : undefined}
        injectedJavaScriptBeforeContentLoaded={platform === "grailed" ? GRAILED_LOGIN_DETECTOR : undefined}
        injectedJavaScript={platform === "grailed" ? GRAILED_LOGIN_DETECTOR : undefined}
        sharedCookiesEnabled
        javaScriptEnabled
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 56, backgroundColor: "#000" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backText: { color: "#888", fontSize: 18 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  webview: { flex: 1 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  savingOverlay: { position: "absolute", top: 100, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", gap: 16 },
  savingText: { color: "#fff", fontSize: 16 },
  error: { color: "#888", padding: 24 },
});
