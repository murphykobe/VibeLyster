import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useOAuth, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { startOAuthFlow: startApple } = useOAuth({ strategy: "oauth_apple" });
  const { startOAuthFlow: startGoogle } = useOAuth({ strategy: "oauth_google" });
  const { signIn, setActive, isLoaded } = useSignIn();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleOAuth(provider: "apple" | "google") {
    setLoading(true);
    setError("");
    try {
      const start = provider === "apple" ? startApple : startGoogle;
      const { createdSessionId, setActive: activate } = await start();
      if (createdSessionId && activate) {
        await activate({ session: createdSessionId });
      }
    } catch (err) {
      console.error("OAuth error:", err);
      setError("Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignIn() {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete" && setActive) {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const msg = (err as { errors?: { message: string }[] })?.errors?.[0]?.message ?? "Invalid email or password.";
      setError(msg);
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
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#555"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, styles.emailButton]} onPress={handleEmailSignIn}>
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>

          <Text style={styles.divider}>or</Text>

          <Pressable style={[styles.button, styles.appleButton]} onPress={() => handleOAuth("apple")}>
            <Text style={[styles.buttonText, styles.darkText]}>Continue with Apple</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.googleButton]} onPress={() => handleOAuth("google")}>
            <Text style={styles.buttonText}>Continue with Google</Text>
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
    marginBottom: 40,
  },
  form: {
    width: "100%",
    gap: 12,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#fff",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
  },
  divider: {
    color: "#444",
    textAlign: "center",
    fontSize: 13,
    marginVertical: 4,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  emailButton: {
    backgroundColor: "#6366f1",
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
    color: "#fff",
  },
  darkText: {
    color: "#000",
  },
});
