import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useOAuth } from "@clerk/clerk-expo";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { startOAuthFlow: startApple } = useOAuth({ strategy: "oauth_apple" });
  const { startOAuthFlow: startGoogle } = useOAuth({ strategy: "oauth_google" });
  const [loading, setLoading] = useState(false);

  async function handleSignIn(provider: "apple" | "google") {
    setLoading(true);
    try {
      const start = provider === "apple" ? startApple : startGoogle;
      const { createdSessionId, setActive } = await start();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
    } catch (err) {
      console.error("Sign in error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>VibeLyster</Text>
      <Text style={styles.tagline}>List faster. Sell everywhere.</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#fff" />
      ) : (
        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.appleButton]} onPress={() => handleSignIn("apple")}>
            <Text style={styles.buttonText}>Continue with Apple</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.googleButton]} onPress={() => handleSignIn("google")}>
            <Text style={[styles.buttonText, styles.googleText]}>Continue with Google</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logo: {
    fontSize: 40,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: "#888",
    marginBottom: 64,
  },
  buttons: {
    width: "100%",
    gap: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  appleButton: {
    backgroundColor: "#fff",
  },
  googleButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#333",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  googleText: {
    color: "#fff",
  },
});
