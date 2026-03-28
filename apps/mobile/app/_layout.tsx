import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { setTokenProvider } from "@/lib/api";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

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
      router.replace("/sign-in");
    } else if (isSignedIn && inAuthGroup) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AuthGuard />
    </ClerkProvider>
  );
}
