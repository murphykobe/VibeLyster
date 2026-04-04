import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type PublishMode = "live" | "draft";

const STORAGE_KEY = "vibelyster.publish-mode";

function isPublishMode(value: string | null): value is PublishMode {
  return value === "live" || value === "draft";
}

async function readWebValue() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

async function writeWebValue(value: PublishMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value);
}

export async function getPublishMode(): Promise<PublishMode> {
  const raw = Platform.OS === "web"
    ? await readWebValue()
    : await SecureStore.getItemAsync(STORAGE_KEY);

  return isPublishMode(raw) ? raw : "live";
}

export async function setPublishMode(mode: PublishMode): Promise<void> {
  if (Platform.OS === "web") {
    await writeWebValue(mode);
    return;
  }

  await SecureStore.setItemAsync(STORAGE_KEY, mode);
}

