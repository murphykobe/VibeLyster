import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
// Weight-level subpath imports: the package roots re-export every weight,
// which would bundle multiple MB of unused fonts into the web export.
import { Archivo_400Regular } from "@expo-google-fonts/archivo/400Regular";
import { Archivo_500Medium } from "@expo-google-fonts/archivo/500Medium";
import { Archivo_600SemiBold } from "@expo-google-fonts/archivo/600SemiBold";
import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black/400Regular";
import { SpaceMono_400Regular } from "@expo-google-fonts/space-mono/400Regular";
import { SpaceMono_700Bold } from "@expo-google-fonts/space-mono/700Bold";
import { Fraunces_500Medium_Italic } from "@expo-google-fonts/fraunces/500Medium_Italic";
import { setTokenProvider } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";
import { BackgroundTokenRefresh } from "@/lib/token-refresh";
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
  const clerk = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const { isLoaded, isSignedIn, getToken } = clerk.useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Configure the API client during render so child screen effects can safely
  // issue authenticated requests on the first committed frame.
  setTokenProvider(async () => getToken());

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === "(auth)";
    if (!isSignedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, segments, router]);

  return (
    <>
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
      {isSignedIn ? <BackgroundTokenRefresh /> : null}
    </>
  );
}

function MockLayout() {
  setTokenProvider(async () => null);

  useEffect(() => {
    setTokenProvider(async () => null);
  }, []);

  return (
    <>
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
      <BackgroundTokenRefresh />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo: Archivo_400Regular,
    "Archivo-Medium": Archivo_500Medium,
    "Archivo-SemiBold": Archivo_600SemiBold,
    "Archivo-Black": ArchivoBlack_400Regular,
    SpaceMono: SpaceMono_400Regular,
    "SpaceMono-Bold": SpaceMono_700Bold,
    "Fraunces-Italic": Fraunces_500Medium_Italic,
  });

  // A failed font load must degrade to system fonts, not a permanent blank screen.
  if (!fontsLoaded && !fontError) return null;

  if (mockMode) {
    return (
      <SafeAreaProvider>
        <ToastProvider>
          <MockLayout />
        </ToastProvider>
      </SafeAreaProvider>
    );
  }

  if (!publishableKey) {
    throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is required when EXPO_PUBLIC_MOCK_MODE is not enabled");
  }

  const clerk = require("@clerk/clerk-expo") as typeof import("@clerk/clerk-expo");
  const ClerkProvider = clerk.ClerkProvider;

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ToastProvider>
          <AuthGuard />
        </ToastProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
