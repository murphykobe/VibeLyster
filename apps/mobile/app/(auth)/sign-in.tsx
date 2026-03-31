import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOAuth, useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { theme } from "@/lib/theme";

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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Welcome back</Text>
          <Text style={styles.logo}>VibeLyster</Text>
          <Text style={styles.tagline}>List faster. Sell everywhere.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in to your account</Text>
          <Text style={styles.cardSub}>Use email/password or continue with your provider.</Text>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={theme.colors.accent} />
            </View>
          ) : (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={theme.colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={[styles.button, styles.emailButton]} onPress={handleEmailSignIn}>
                <Text style={styles.primaryButtonText}>Sign in</Text>
              </Pressable>

              <Text style={styles.divider}>or</Text>

              <Pressable style={[styles.button, styles.appleButton]} onPress={() => handleOAuth("apple")}>
                <Text style={styles.appleButtonText}>Continue with Apple</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.googleButton]} onPress={() => handleOAuth("google")}>
                <Text style={styles.secondaryButtonText}>Continue with Google</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 18,
  },
  hero: {
    gap: 4,
  },
  kicker: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.sansBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  logo: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: 42,
    lineHeight: 46,
  },
  tagline: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 15,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
    ...theme.shadow.card,
  },
  cardTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 20,
  },
  cardSub: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  loaderWrap: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  form: {
    width: "100%",
    gap: 12,
  },
  input: {
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
  },
  error: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    textAlign: "center",
  },
  divider: {
    color: theme.colors.textMuted,
    textAlign: "center",
    fontFamily: theme.fonts.sans,
    fontSize: 13,
    marginVertical: 2,
  },
  button: {
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  emailButton: {
    backgroundColor: theme.colors.accent,
  },
  appleButton: {
    backgroundColor: theme.colors.text,
  },
  googleButton: {
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  appleButtonText: {
    color: theme.colors.white,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sansBold,
    fontSize: 15,
  },
});
