import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { setTokenProvider } from "@/lib/api";
import { theme } from "@/lib/theme";

const mockMode = ["1", "true", "yes", "on"].includes((process.env.EXPO_PUBLIC_MOCK_MODE ?? "").toLowerCase());
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AuthGuard() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    // Wire up the API client's token provider
    setTokenProvider(async () => getToken());

    const inAuthGroup = segments[0] === "(auth)";
    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, segments]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 220,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="capture" options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="listing/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="connect/[platform]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="(auth)/sign-in" options={{ animation: "fade" }} />
    </Stack>
  );
}

function MockLayout() {
  useEffect(() => {
    setTokenProvider(async () => null);
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 220,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
      <Stack.Screen name="capture" options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="listing/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="connect/[platform]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="(auth)/sign-in" options={{ animation: "fade" }} />
    </Stack>
  );
}

export default function RootLayout() {
  if (mockMode) {
    return <MockLayout />;
  }

  if (!publishableKey) {
    throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required when EXPO_PUBLIC_MOCK_MODE is not enabled");
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AuthGuard />
    </ClerkProvider>
  );
}
